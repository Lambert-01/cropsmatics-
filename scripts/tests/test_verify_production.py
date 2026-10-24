from scripts.verify_production import REQUIRED_CHECKS


def test_production_gate_uses_a_meaningful_district_map_selection():
    check = next(item for item in REQUIRED_CHECKS if item.name == "map metrics")

    assert check.required is True
    assert "metric=yield" in check.path
    assert "crop=Maize" in check.path
    assert "period_code=2026B" in check.path
