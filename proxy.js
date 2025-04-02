const http = require("http");
const tls = require("tls");
const fs = require("fs");
const { spawnSync } = require("child_process");

const path = require("path");

const PROXY_PORT = 8080;
const CA_KEY_PATH = "cert.key";

const genCerts = (hostname) => {
  const certPath = path.join(__dirname, `certs/${hostname}.crt`);

  if (!fs.existsSync(certPath)) {
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
    key: fs.readFileSync(CA_KEY_PATH),
    cert: fs.readFileSync(certPath),
  };
};

const server = http.createServer((req, res) => {
  const { method, headers } = req;

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

  const proxyReq = http.request(options, (proxyRes) => {
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
  const [host, port] = req.url.split(":");

  const cert = genCerts(host);

  const serverSocket = tls.connect(
    {
      host: host,
      port: port || 443,
      rejectUnauthorized: false,
    },
    () => {
      clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      console.log(`Starting TLS handshake with ${host}:${port}`);
      const tlsSocket = new tls.TLSSocket(clientSocket, {
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

server.listen(PROXY_PORT, () => {
  console.log(`Proxy server running on port ${PROXY_PORT}`);
});
