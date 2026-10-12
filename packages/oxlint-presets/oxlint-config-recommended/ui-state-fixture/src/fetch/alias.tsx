const request = fetch

export const load = async (url: string): Promise<Response> => request(url)
