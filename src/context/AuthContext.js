import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { authApi, login as loginRequest, warehousesApi } from '../services/api';
import {
  clearSession,
  getActiveBranchId,
  getAuthToken,
  setActiveBranchId,
  setAuthToken,
} from '../services/apiConfig';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [status, setStatus] = useState('loading'); // loading | signedOut | signedIn
  const [user, setUser] = useState(null);
  const [branches, setBranches] = useState([]);
  const [activeBranchId, setActiveBranchIdState] = useState(null);

  const bootstrap = useCallback(async () => {
    const token = await getAuthToken();
    if (!token) {
      setStatus('signedOut');
      return;
    }
    try {
      // me/warehouses/saved-branch-id are all independent of each other -
      // fetching them one at a time in sequence was adding their latencies
      // together for no reason, making every app open (and login below)
      // noticeably slower than it needed to be.
      const [me, list, savedBranch] = await Promise.all([authApi.me(), warehousesApi.list(), getActiveBranchId()]);
      setUser(me);
      setBranches(list);
      setActiveBranchIdState(savedBranch);
      setStatus('signedIn');
    } catch {
      await clearSession();
      setStatus('signedOut');
    }
  }, []);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  const login = useCallback(async (username, password) => {
    const data = await loginRequest(username, password);
    await setAuthToken(data.access_token);
    const [me, list] = await Promise.all([authApi.me(), warehousesApi.list()]);
    setUser(me);
    setBranches(list);
    if (list.length === 1) {
      await setActiveBranchId(list[0].id);
      setActiveBranchIdState(list[0].id);
    }
    setStatus('signedIn');
    return list;
  }, []);

  const chooseBranch = useCallback(async (id) => {
    await setActiveBranchId(id);
    setActiveBranchIdState(id);
  }, []);

  const logout = useCallback(async () => {
    await clearSession();
    setUser(null);
    setBranches([]);
    setActiveBranchIdState(null);
    setStatus('signedOut');
  }, []);

  const value = useMemo(
    () => ({ status, user, branches, activeBranchId, login, chooseBranch, logout }),
    [status, user, branches, activeBranchId, login, chooseBranch, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
