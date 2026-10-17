import { beforeEach, describe, expect, it, vi } from "vitest";

import { flushOutbox } from "../src/sync/queue";

const mocks = vi.hoisted(() => ({
  database: {
    enqueue: vi.fn(),
    insertHarvest: vi.fn(),
    listPendingOutbox: vi.fn(),
    markConflict: vi.fn(),
    markFailed: vi.fn(),
    markSynced: vi.fn(),
    upsertFarm: vi.fn(),
  },
  api: {
    createFarm: vi.fn(),
    createHarvest: vi.fn(),
  },
  network: {
    getNetworkStateAsync: vi.fn(),
  },
}));

vi.mock("../src/database", () => mocks.database);
vi.mock("../src/services/api", () => ({ api: mocks.api }));
vi.mock("expo-network", () => mocks.network);

const FARM = {
  clientUuid: "farm-1",
  name: "Mugisha farm",
  district: "Bugesera",
  sector: "Rwamagana",
  farmSizeHa: 1.25,
  latitude: -2.05,
  longitude: 30.11,
  createdAt: "2026-10-17T00:00:00.000Z",
  updatedAt: "2026-10-17T00:00:00.000Z",
  syncStatus: "PENDING",
};

const HARVEST = {
  clientUuid: "harvest-1",
  farmClientUuid: "farm-1",
  district: "Bugesera",
  crop: "Maize",
  expectedQuantityKg: 400,
  harvestStartDate: "2026-09-01",
  harvestEndDate: "2026-09-14",
  expectedHarvestDate: "2026-09-10",
  latitude: -2.05,
  longitude: 30.11,
  notes: "planted after first rains",
  needsStorageAssistance: true,
  createdAt: "2026-10-17T00:00:00.000Z",
  updatedAt: "2026-10-17T00:00:00.000Z",
  syncStatus: "PENDING",
};

function outboxItem(entity: string, payload: object) {
  return {
    clientUuid: (payload as { clientUuid: string }).clientUuid,
    entity,
    operation: "create",
    payload: JSON.stringify(payload),
    createdAt: "2026-10-17T00:00:00.000Z",
    attempts: 0,
    status: "PENDING",
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.network.getNetworkStateAsync.mockResolvedValue({
    isConnected: true,
    isInternetReachable: true,
  });
  mocks.database.listPendingOutbox.mockReturnValue([]);
});

describe("flushOutbox: farm profiles", () => {
  it("uploads the profile and only then marks it synced", async () => {
    mocks.database.listPendingOutbox.mockReturnValue([outboxItem("local_farm", FARM)]);

    let resolveUpload: (value: { id: string; client_uuid: string | null }) => void = () => {};
    mocks.api.createFarm.mockReturnValue(
      new Promise((resolve) => {
        resolveUpload = resolve;
      }),
    );

    const flush = flushOutbox();
    // isOnline() resolves on a microtask; wait until the upload has started.
    await vi.waitFor(() => expect(mocks.api.createFarm).toHaveBeenCalledTimes(1));
    expect(mocks.api.createFarm).toHaveBeenCalledWith({
      client_uuid: "farm-1",
      name: "Mugisha farm",
      district: "Bugesera",
      sector: "Rwamagana",
      farm_size_ha: 1.25,
      latitude: -2.05,
      longitude: 30.11,
    });
    // The acknowledgement has not arrived, so the local entry must still be queued.
    expect(mocks.database.markSynced).not.toHaveBeenCalled();

    resolveUpload({ id: "server-farm-1", client_uuid: "farm-1" });
    const summary = await flush;

    expect(mocks.database.markSynced).toHaveBeenCalledWith("farm-1", "server-farm-1", "local_farm");
    expect(mocks.database.markSynced.mock.invocationCallOrder[0]).toBeGreaterThan(
      mocks.api.createFarm.mock.invocationCallOrder[0],
    );
    expect(summary).toEqual({ attempted: 1, synced: 1, failed: 0, conflicts: 0 });
  });

  it("keeps the entry queued when the upload fails", async () => {
    mocks.database.listPendingOutbox.mockReturnValue([outboxItem("local_farm", FARM)]);
    mocks.api.createFarm.mockRejectedValue(new Error("API /farms failed: 500"));

    const summary = await flushOutbox();

    expect(mocks.database.markSynced).not.toHaveBeenCalled();
    expect(mocks.database.markFailed).toHaveBeenCalledWith("farm-1", "local_farm");
    expect(summary).toEqual({ attempted: 1, synced: 0, failed: 1, conflicts: 0 });
  });

  it("records a 409 as a conflict instead of retrying blindly", async () => {
    mocks.database.listPendingOutbox.mockReturnValue([outboxItem("local_farm", FARM)]);
    mocks.api.createFarm.mockRejectedValue(new Error("API /farms failed: 409"));

    const summary = await flushOutbox();

    expect(mocks.database.markSynced).not.toHaveBeenCalled();
    expect(mocks.database.markConflict).toHaveBeenCalledWith("farm-1", "local_farm");
    expect(summary).toEqual({ attempted: 1, synced: 0, failed: 0, conflicts: 1 });
  });
});

describe("flushOutbox: harvest registrations", () => {
  it("marks the registration synced with the server id after the upload", async () => {
    mocks.database.listPendingOutbox.mockReturnValue([outboxItem("harvest_registration", HARVEST)]);
    mocks.api.createHarvest.mockResolvedValue({ id: "server-harvest-1", sync_status: "SYNCED" });

    const summary = await flushOutbox();

    expect(mocks.api.createHarvest).toHaveBeenCalledWith(
      expect.objectContaining({
        client_uuid: "harvest-1",
        farm_client_uuid: "farm-1",
        district: "Bugesera",
        crop: "Maize",
        harvest_start_date: "2026-09-01",
        harvest_end_date: "2026-09-14",
        needs_storage_assistance: true,
      }),
    );
    expect(mocks.database.markSynced).toHaveBeenCalledWith(
      "harvest-1",
      "server-harvest-1",
      "harvest_registration",
    );
    expect(summary).toEqual({ attempted: 1, synced: 1, failed: 0, conflicts: 0 });
  });
});

describe("flushOutbox: connectivity", () => {
  it("does not touch the queue while offline", async () => {
    mocks.network.getNetworkStateAsync.mockResolvedValue({ isConnected: false });

    const summary = await flushOutbox();

    expect(summary).toEqual({ attempted: 0, synced: 0, failed: 0, conflicts: 0 });
    expect(mocks.database.listPendingOutbox).not.toHaveBeenCalled();
  });

  it("shares one in-flight flush between concurrent callers", async () => {
    const pending = outboxItem("local_farm", FARM);
    mocks.database.listPendingOutbox.mockReturnValue([pending]);
    let resolveUpload: (value: { id: string; client_uuid: string | null }) => void = () => {};
    mocks.api.createFarm.mockReturnValue(
      new Promise((resolve) => {
        resolveUpload = resolve;
      }),
    );

    const first = flushOutbox();
    const second = flushOutbox();
    expect(second).toBe(first);
    await vi.waitFor(() => expect(mocks.api.createFarm).toHaveBeenCalledTimes(1));
    resolveUpload({ id: "server-farm-1", client_uuid: "farm-1" });
    await expect(Promise.all([first, second])).resolves.toEqual([
      { attempted: 1, synced: 1, failed: 0, conflicts: 0 },
      { attempted: 1, synced: 1, failed: 0, conflicts: 0 },
    ]);
  });
});
