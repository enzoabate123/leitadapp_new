export const API_URL = (() => {
  const { hostname, protocol } = window.location;
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.')) {
    return `${protocol}//${hostname}:3003`;
  }
  return `${protocol}//api-${hostname}`;
})();
