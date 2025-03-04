import got from 'got';
import {CookieHandler} from ("../lib/cookies");
import {setHeaders, setAgent} from ("../lib/options");
import {type} from ("../util/types");

// Responsible for applying proxy
const requestHandler = async (request, proxy, overrides = {}) => {
    // Reject non http(s) URI schemes
    console.log("requestHandler");
    console.log("Request");
    console.log(request);
    console.log("proxy");
    console.log(proxy);
    console.log("overrides");
    console.log(overrides);
    if (!request.url().startsWith("http") && !request.url().startsWith("https")) {
        console.log("continuing");
        request.continue(); return;
    }
    const cookieHandler = new CookieHandler(request);
    // Request options for GOT accounting for overrides
    const options = {
        cookieJar: await cookieHandler.getCookies(),
        method: overrides.method || request.method(),
        body: overrides.postData || request.postData(),
        headers: overrides.headers || setHeaders(request),
        agent: setAgent(proxy),
        responseType: "buffer",
        maxRedirects: 15,
        throwHttpErrors: false,
        ignoreInvalidCookies: true,
        followRedirect: false
    };
    try {
        console.log("Try");
        const response = await got(overrides.url || request.url(), options);
        // Set cookies manually because "set-cookie" doesn't set all cookies (?)
        // Perhaps related to https://github.com/puppeteer/puppeteer/issues/5364
        const setCookieHeader = response.headers["set-cookie"];        
        if (setCookieHeader) {
            console.log("Inside setCookieHeader");
            await cookieHandler.setCookies(setCookieHeader);
            response.headers["set-cookie"] = undefined;
            console.log("Done setCookieHeader");
        }
        console.log("Starting request...");
        await request.respond({
            status: response.statusCode,
            headers: response.headers,
            body: response.body
        });
    } catch (error) {
        await request.abort();
    }
};

// For reassigning proxy of page
const removeRequestListener = (page, listenerName) => {
    const eventName = "request";
    const listeners = page.eventsMap.get(eventName);
    if (listeners) {
        const i = listeners.findIndex((listener) => {
            return listener.name === listenerName
        });
        listeners.splice(i, 1);
        if (!listeners.length) {
            page.eventsMap.delete(eventName);
        }
    }
};

const useProxyPer = {
    // Call this if request object passed
    HTTPRequest: async (request, data) => {
        let proxy, overrides;
        // Separate proxy and overrides
        console.log("request");
        console.log(request);
        console.log("data");
        console.log(data);
        if (type(data) === "object") {
            if (Object.keys(data).length !== 0) {
                proxy = data.proxy;
                delete data.proxy;
                overrides = data;
            }
        } else {proxy = data}
        // Skip request if proxy omitted
        if (proxy) {
            console.log("Proxying request:");
            console.log(request);
            console.log(proxy);
            console.log(overrides);
            await requestHandler(request, proxy, overrides)
        }
        else {
            request.continue(overrides)
        }
    },

    // Call this if page object passed
    CDPPage: async (page, proxy) => {
        console.log("CDPPAge");
        await page.setRequestInterception(true);
        const listener = "$ppp_requestListener";
        removeRequestListener(page, listener);
        const f = {[listener]: async (request) => {
            await requestHandler(request, proxy);
        }};
        if (proxy) {
            console.log("Proxying..");
            page.on("request", f[listener])
        }
        else {
            await page.setRequestInterception(false)
        }
    }
}

// Main function
export const useProxy = async (target, data) => {
    let name = target.constructor.name;
    if(name == "Page"){
        name = "CDPPage"
    }
    useProxyPer[name](target, data);
};