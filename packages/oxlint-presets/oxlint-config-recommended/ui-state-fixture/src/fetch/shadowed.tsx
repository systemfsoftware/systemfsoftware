export const load = async (fetch: (url: string) => Promise<Response>, url: string): Promise<Response> => fetch(url)
