export async function loadEsmModule<T>(specifier: string): Promise<T> {
  const loader = new Function('specifier', 'return import(specifier)') as (
    specifier: string,
  ) => Promise<T>;

  return loader(specifier);
}
