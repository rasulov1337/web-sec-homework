import { createServer, request } from "http";
import { connect, TLSSocket } from "tls";
import { existsSync, readFileSync } from "fs";
import { spawnSync } from "child_process";
import { saveRequest, getRequestById } from "./storage.js";
import { URL } from "url";

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
                    post_params: parseBody(headers["content-type"], body),
                    response_code: proxyRes.statusCode,
                    response_headers: proxyRes.headers,
                    response_body: responseBody.toString(),
                });

                res.end(responseBody);
            });

            const headersCopy = { ...proxyRes.headers };
            delete headersCopy["content-length"]; // убрать
            res.writeHead(proxyRes.statusCode, headersCopy);
        });

        proxyReq.on("error", () => {
            res.writeHead(500, { "Content-Type": "text/plain" });
            res.end("Proxy Error\n");
        });

        if (body) {
            proxyReq.write(body);
        }
        proxyReq.end();
    });
});

// Emitted each time a server responds to a request with a CONNECT method
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
            });

            if (head && head.length) {
                serverSocket.write(head);
            }

            tlsSocket.pipe(serverSocket).pipe(tlsSocket);
        }
    );

    serverSocket.on("error", () => {
        clientSocket.write("HTTP/1.1 502 Bad Gateway\r\n\r\n");
        clientSocket.end();
    });

    clientSocket.on("error", () => serverSocket.end());
});

export default server;
