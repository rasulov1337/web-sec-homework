import webApi from "./web-api.js";
import proxy from "./proxy.js";

const PROXY_PORT = 8080;
const WEB_API_PORT = 8000;

webApi.listen(WEB_API_PORT, () => {
  console.log(`Web API running on port ${WEB_API_PORT}`);
});

proxy.listen(PROXY_PORT, () => {
  console.log(`Proxy server running on port ${PROXY_PORT}`);
});
