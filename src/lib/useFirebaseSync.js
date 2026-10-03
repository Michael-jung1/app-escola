import { useEffect, useState } from 'react';
import { useAuth, isClerkConfigured } from './clerkAuth';
import { signInWithCustomToken, signOut } from 'firebase/auth';
import { auth } from './firebase';

/**
 * Faz a ponte: quando o usuário loga no Clerk, este hook busca um Firebase Custom
 * Token (via /api/firebase-token) e usa ele pra logar no Firebase Auth também —
 * com o MESMO userId nos dois. Isso permite manter o Firestore como banco de dados
 * do App Escola sem o usuário precisar de duas contas separadas.
 *
 * Retorna `firebaseReady`: só true quando o Firebase Auth também terminou de logar,
 * o que os componentes devem esperar antes de tentar ler/escrever no Firestore.
 */
export function useFirebaseSync() {
  const { isLoaded, isSignedIn, getToken, userId } = useAuth();
  const [firebaseReady, setFirebaseReady] = useState(false);
  const [syncError, setSyncError] = useState(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn) {
      signOut(auth).catch(() => {});
      setFirebaseReady(false);
      return;
    }

    if (!isClerkConfigured) {
      // Em modo de demonstração / local, o app funciona com armazenamento local
      setFirebaseReady(true);
      setSyncError(null);
      return;
    }

    let cancelled = false;

    async function syncFirebase() {
      const delays = [3000, 6000];
      const maxAttempts = 3;

      for (let i = 0; i < maxAttempts; i++) {
        if (cancelled) return;

        try {
          const clerkToken = await getToken();
          if (!clerkToken) {
            throw new Error('Token do Clerk indisponível');
          }

          const res = await fetch('/api/firebase-token', {
            method: 'POST',
            headers: { Authorization: `Bearer ${clerkToken}` },
          });

          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || `HTTP ${res.status}`);
          }

          const { firebaseToken } = await res.json();
          if (!firebaseToken) {
            throw new Error('Token do Firebase não retornado');
          }

          await signInWithCustomToken(auth, firebaseToken);

          if (!cancelled) {
            setFirebaseReady(true);
            setSyncError(null);
          }
          return;
        } catch (error) {
          console.warn(`Tentativa ${i + 1}/${maxAttempts} de sincronização falhou:`, error.message || error);
          if (cancelled) return;

          if (i < maxAttempts - 1) {
            const waitMs = delays[i] || 3000;
            await new Promise(resolve => setTimeout(resolve, waitMs));
          }
        }
      }

      if (!cancelled) {
        setFirebaseReady(false);
        setSyncError('Não foi possível conectar à sua conta. Verifique a internet e tente novamente.');
      }
    }

    syncFirebase();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, getToken, userId, attempt]);

  return {
    firebaseReady,
    syncError,
    userId,
    retry: () => {
      setSyncError(null);
      setFirebaseReady(false);
      setAttempt(a => a + 1);
    }
  };
}
