import { createServer, request } from "http";
import { connect, TLSSocket } from "tls";
import { existsSync, readFileSync } from "fs";
import { spawnSync } from "child_process";
import { requests } from "./storage.js";

const CA_KEY_PATH = "cert.key";

let idIncrement = 0;

const genCerts = (hostname) => {
  const certPath = `certs/${hostname}.crt`;

  if (!existsSync(certPath)) {
    console.log(`Generating certificate for ${hostname}`);
    const result = spawnSync(
      "./gen_cert.sh",
      [hostname, Date.now().toString()],
      {
        stdio: "inherit",
      },
    );
    if (result.error) {
      throw new Error("Certificate generation failed");
    }
  }

  return {
    key: readFileSync(CA_KEY_PATH),
    cert: readFileSync(certPath),
  };
};

const server = createServer((req, res) => {
  const { method, headers } = req;
  requests[idIncrement++] = [`${method}`, `${req.url}`];

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
  filteredHeaders["host"] = targetHost;

  const options = {
    hostname: targetHost,
    port: targetPort,
    path: relativePath,
    method: method,
    headers: filteredHeaders,
  };

  const proxyReq = request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on("error", (err) => {
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Proxy Error\n");
  });

  req.pipe(proxyReq);
});

// Emitted each time a server responds to a request with a CONNECT method
server.on("connect", (req, clientSocket, head) => {
  requests[idIncrement++] = ["CONNECT", req.url];
  const [host, port] = req.url.split(":");

  const cert = genCerts(host);

  const serverSocket = connect(
    {
      host: host,
      port: port || 443,
      rejectUnauthorized: false,
    },
    () => {
      clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      console.log(`Starting TLS handshake with ${host}:${port}`);
      const tlsSocket = new TLSSocket(clientSocket, {
        isServer: true,
        key: cert.key,
        cert: cert.cert,
        rejectUnauthorized: false,
      });

      if (head && head.length) {
        serverSocket.write(head);
      }

      tlsSocket.pipe(serverSocket).pipe(tlsSocket);
    },
  );

  serverSocket.on("error", (err) => {
    console.error("TLS Connection error:", err);
    clientSocket.write("HTTP/1.1 502 Bad Gateway\r\n\r\n");
    clientSocket.end();
  });

  clientSocket.on("error", () => serverSocket.end());
});

export default server;
