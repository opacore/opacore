'use client';

import { useCallback, useEffect, useState } from 'react';
import { auth, type UserPublic } from './api';

interface AuthState {
  user: UserPublic | null;
  isPending: boolean;
}

let cachedUser: UserPublic | null = null;
let listeners: Set<() => void> = new Set();

function notifyListeners() {
  listeners.forEach((fn) => fn());
}

export function useSession() {
  const [state, setState] = useState<AuthState>({
    user: cachedUser,
    isPending: cachedUser === null,
  });

  const refresh = useCallback(async () => {
    try {
      const user = await auth.me();
      cachedUser = user;
      setState({ user, isPending: false });
    } catch {
      cachedUser = null;
      setState({ user: null, isPending: false });
    }
  }, []);

  useEffect(() => {
    // Only fetch if we haven't cached yet
    if (cachedUser === null && state.isPending) {
      refresh();
    }

    const listener = () => {
      setState({ user: cachedUser, isPending: false });
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, [refresh, state.isPending]);

  return {
    data: state.user ? { user: state.user } : null,
    isPending: state.isPending,
    refresh,
  };
}

export async function signIn(email: string, password: string) {
  const user = await auth.login({ email, password });
  cachedUser = user;
  notifyListeners();
  return user;
}

export async function signUp(data: { name: string; email: string; password: string }) {
  const user = await auth.register(data);
  cachedUser = user;
  notifyListeners();
  return user;
}

export async function signOut() {
  try {
    await auth.logout();
  } catch {
    // ignore
  }
  cachedUser = null;
  notifyListeners();
}
