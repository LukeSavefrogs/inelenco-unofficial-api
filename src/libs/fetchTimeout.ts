/**
 * 
 * @param url The URL to fetch
 * @param ms Milliseconds to wait before timing out
 * @param config The fetch config to use
 * @returns promise
 * 
 * @see https://stackoverflow.com/a/57888548/8965861
 * 
 * https://stackoverflow.com/a/57528438/8965861
 */
function fetchTimeout (url: string, ms: number, { signal, ...options }: {signal?: AbortSignal} = {}) {
    const controller = new AbortController();
    const promise = fetch(url, { signal: controller.signal, ...options });
    if (signal) signal.addEventListener("abort", () => controller.abort());
    const timeout = setTimeout(() => controller.abort(), ms);
    return promise.finally(() => clearTimeout(timeout));
};

export default fetchTimeout;