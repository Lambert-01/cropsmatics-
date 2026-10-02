/**
 * Ambient module declarations for assets that are imported for their side
 * effects (Next.js compiles these; TypeScript has no idea what a `.css` file
 * exports).
 *
 * These must live in a global `.d.ts` file with no top-level `import`/`export`.
 * Writing `declare module "*.css"` inside a module file such as `layout.tsx`
 * is a module *augmentation*, which TS rejects with:
 *   TS2664: Invalid module name in augmentation, module '*.css' cannot be found.
 * and leaves the side-effect import unresolved:
 *   TS2882: Cannot find module or type declarations for side-effect import of './globals.css'.
 */

declare module "*.css" {
  const css: string;
  export default css;
}

declare module "*.module.css" {
  const classes: { readonly [className: string]: string };
  export default classes;
}
