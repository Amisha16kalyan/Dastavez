export const API_BASE_URL = (
  import.meta.env.VITE_API_URL || "https://dastavez-xanh.onrender.com"
).replace(/\/+$/, "");

export const WS_URL = (
  import.meta.env.VITE_WS_URL || API_BASE_URL.replace(/^http/, "ws")
).replace(/\/+$/, "");