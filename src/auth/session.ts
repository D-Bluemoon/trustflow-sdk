const TOKEN_KEY = 'trustflow_token';
const ADDRESS_KEY = 'trustflow_address';

export function saveSession(token: string, address: string): void {
  if (typeof localStorage === 'undefined') {
    return;
  }
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(ADDRESS_KEY, address);
}

export function loadSession(): { token: string; address: string } | null {
  if (typeof localStorage === 'undefined') {
    return null;
  }
  const token = localStorage.getItem(TOKEN_KEY);
  const address = localStorage.getItem(ADDRESS_KEY);
  if (!token || !address) {
    return null;
  }
  return { token, address };
}

export function clearSession(): void {
  if (typeof localStorage === 'undefined') {
    return;
  }
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ADDRESS_KEY);
}
