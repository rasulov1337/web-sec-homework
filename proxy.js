import { createServer, request } from "http";
import { connect, TLSSocket } from "tls";
import { existsSync, readFileSync } from "fs";
import { spawnSync } from "child_process";
import { saveRequest, getRequestById } from "./storage.js";
import { URL } from "url";
import POSSIBLE_PARAMS from "./params.js";

const __dirname = new URL(".", import.meta.url).pathname;
const CA_KEY_PATH = "cert.key";

const genCerts = (hostname) => {
    const certPath = __dirname + `certs/${hostname}.crt`;
    if (!existsSync(certPath)) {
        console.log(`Generating certificate for ${hostname}`);
        spawnSync(
            __dirname + "gen_cert.sh",
            [hostname, Date.now().toString()],
            { stdio: "inherit" }
        );
    }
    return {
        key: readFileSync(CA_KEY_PATH),
        cert: readFileSync(certPath),
    };
};

function parseCookies(header = "") {
    const cookies = {};
    header.split(";").forEach((pair) => {
        const [key, value] = pair.split("=");
        if (key && value)
            cookies[key.trim()] = decodeURIComponent(value.trim());
    });
    return cookies;
}

function parseBody(contentType, body) {
    if (!contentType) return null;
    if (contentType.includes("application/x-www-form-urlencoded")) {
        const params = {};
        new URLSearchParams(body).forEach((v, k) => (params[k] = v));
        return params;
    }
    return null;
}

function parseHttpRequest(buffer) {
    const text = buffer.toString();
    const [headerPart, bodyPart = ""] = text.split("\r\n\r\n");
    const headerLines = headerPart.split("\r\n");

    const [method, path] = headerLines[0].split(" ");
    const headers = {};
    headerLines.slice(1).forEach((line) => {
        const [key, ...value] = line.split(": ");
        headers[key.toLowerCase()] = value.join(": ");
    });

    const postParams = headers["content-type"]?.includes(
        "application/x-www-form-urlencoded"
    )
        ? Object.fromEntries(new URLSearchParams(bodyPart))
        : {};

    return {
        method,
        path,
        headers,
        cookies: headers["cookie"]
            ? Object.fromEntries(
                  headers["cookie"].split("; ").map((c) => c.split("="))
              )
            : {},
        postParams,
        rawBody: bodyPart,
    };
}

export async function scanRequestForHiddenParams(requestId) {
    const entry = getRequestById(requestId);
    if (!entry) return { error: "Request not found" };

    const headers = JSON.parse(entry.headers);
    const host = headers.host;

    if (!host) return { error: "Host header not found in request data" };

    const hiddenParams = [];
    const testValue = "djsahaf";

    let baseUrl;
    try {
        baseUrl = new URL(entry.path, `${entry.protocol}://${host}`);
    } catch (e) {
        return { error: "Invalid URL constructed from request data" };
    }

    console.log(POSSIBLE_PARAMS);

    for (const param of POSSIBLE_PARAMS) {
        const url = new URL(baseUrl);
        url.searchParams.append(param, testValue);
        console.log("Scanning", `${entry.protocol}://${host}${entry.path}`);

        try {
            const res = await fetch(url.toString(), {
                method: "GET",
                headers: headers,
            });
            const body = await res.text();
            if (body.includes(testValue)) {
                hiddenParams.push(param);
            }
        } catch (err) {
            console.error(`Failed to scan param ${param}:`, err);
        }
    }

    return { hiddenParams };
}

const server = createServer((req, res) => {
    const { method, headers } = req;
    let bodyChunks = [];

    req.on("data", (chunk) => bodyChunks.push(chunk));

    req.on("end", () => {
        const body = Buffer.concat(bodyChunks).toString();

        const match = req.url.match(/^http:\/\/([^\/]+)(.*)$/);
        if (!match) {
            res.writeHead(400, { "Content-Type": "text/plain" });
            res.end("Bad Request\n");
            return;
        }

        let [targetHost, targetPort] = match[1].split(":");
        targetPort = targetPort || 80;
        const relativePath = match[2] || "/";

        const filteredHeaders = { ...headers };
        delete filteredHeaders["proxy-connection"];
        delete filteredHeaders["Proxy-Connection"];
        delete filteredHeaders["accept-encoding"];
        delete filteredHeaders["Accept-Encoding"];
        filteredHeaders["host"] = targetHost;

        if (body) {
            filteredHeaders["content-length"] = Buffer.byteLength(body);
        }

        const postParams = headers["content-type"]?.includes(
            "application/x-www-form-urlencoded"
        )
            ? Object.fromEntries(new URLSearchParams(body))
            : {};

        const options = {
            hostname: targetHost,
            port: targetPort,
            path: relativePath,
            method,
            headers: filteredHeaders,
        };

        const proxyReq = request(options, (proxyRes) => {
            let responseChunks = [];

            proxyRes.on("data", (chunk) => responseChunks.push(chunk));
            proxyRes.on("end", () => {
                const responseBody = Buffer.concat(responseChunks);

                saveRequest({
                    method,
                    path: relativePath,
                    get_params: Object.fromEntries(
                        new URLSearchParams(new URL(req.url).search)
                    ),
                    headers: filteredHeaders,
                    cookies: parseCookies(headers["cookie"]),
                    post_params: postParams,
                    response_code: proxyRes.statusCode,
                    response_headers: proxyRes.headers,
                    response_body: responseBody.toString(),
                    request_body: body,
                    protocol: "http",
                });
            });

            const headersCopy = { ...proxyRes.headers };
            delete headersCopy["content-length"];
            res.writeHead(proxyRes.statusCode, headersCopy);
            proxyRes.pipe(res);
        });

        proxyReq.on("error", () => {
            res.writeHead(500, { "Content-Type": "text/plain" });
            res.end("Proxy Error\n");
        });

        if (body) proxyReq.write(body);
        proxyReq.end();
    });
});

server.on("connect", (req, clientSocket, head) => {
    const [host, port] = req.url.split(":");
    const cert = genCerts(host);

    const serverSocket = connect(
        { host, port: port || 443, rejectUnauthorized: false },
        () => {
            clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");

            const tlsSocket = new TLSSocket(clientSocket, {
                isServer: true,
                key: cert.key,
                cert: cert.cert,
                rejectUnauthorized: false,
            });

            let clientData = [];
            let serverData = [];

            tlsSocket.on("data", (chunk) => {
                clientData.push(chunk);
                serverSocket.write(chunk);
            });

            serverSocket.on("data", (chunk) => {
                serverData.push(chunk);
                tlsSocket.write(chunk);
            });

            tlsSocket.on("end", () => {
                const fullRequest = Buffer.concat(clientData);
                const parsed = parseHttpRequest(fullRequest);

                saveRequest({
                    method: parsed.method,
                    path: parsed.path,
                    get_params: parsed.path.includes("?")
                        ? Object.fromEntries(
                              new URLSearchParams(parsed.path.split("?")[1])
                          )
                        : {},
                    headers: parsed.headers,
                    cookies: parsed.cookies,
                    post_params: parsed.postParams,
                    response_code: 200,
                    response_headers: {},
                    response_body: Buffer.concat(serverData).toString(),
                    request_body: parsed.rawBody,
                    protocol: "https",
                });

                serverSocket.end();
            });

            serverSocket.on("end", () => tlsSocket.end());
        }
    );

    serverSocket.on("error", (err) => {
        console.error("TLS Connection error:", err);
        clientSocket.write("HTTP/1.1 502 Bad Gateway\r\n\r\n");
        clientSocket.end();
    });

    clientSocket.on("error", () => serverSocket.end());
});

export default server;
