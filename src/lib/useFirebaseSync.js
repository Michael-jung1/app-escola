import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
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

  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn) {
      signOut(auth).catch(() => {});
      setFirebaseReady(false);
      return;
    }

    let cancelled = false;

    async function syncFirebase() {
      try {
        const clerkToken = await getToken();

        const res = await fetch('/api/firebase-token', {
          method: 'POST',
          headers: { Authorization: `Bearer ${clerkToken}` },
        });

        if (!res.ok) {
          throw new Error('Falha ao obter token do Firebase');
        }

        const { firebaseToken } = await res.json();
        await signInWithCustomToken(auth, firebaseToken);

        if (!cancelled) {
          setFirebaseReady(true);
          setSyncError(null);
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Erro ao sincronizar com Firebase:', error);
          setSyncError('Não foi possível sincronizar seus dados. Tente recarregar a página.');
          setFirebaseReady(false);
        }
      }
    }

    syncFirebase();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, getToken, userId]);

  return { firebaseReady, syncError, userId };
}
