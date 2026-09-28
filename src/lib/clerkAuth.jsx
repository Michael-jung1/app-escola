import React, { createContext, useContext, useState } from 'react';
import * as RealClerk from '@clerk/clerk-react';

const rawKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
export const isClerkConfigured = Boolean(
  rawKey &&
  !rawKey.includes('your_') &&
  (rawKey.startsWith('pk_test_') || rawKey.startsWith('pk_live_'))
);

const MockClerkContext = createContext(null);

export function ClerkProvider({ children, publishableKey, ...props }) {
  const effectiveKey = publishableKey || rawKey;
  if (isClerkConfigured && effectiveKey) {
    return (
      <RealClerk.ClerkProvider publishableKey={effectiveKey} {...props}>
        {children}
      </RealClerk.ClerkProvider>
    );
  }

  return <MockClerkProvider>{children}</MockClerkProvider>;
}

function MockClerkProvider({ children }) {
  const [isSignedIn, setIsSignedIn] = useState(true);
  const [user] = useState({
    id: 'estudante-demo',
    fullName: 'Estudante Demo',
    primaryEmailAddress: { emailAddress: 'estudante@studyapp.local' },
  });

  const signOut = async () => {
    setIsSignedIn(false);
  };

  const openSignIn = () => {
    setIsSignedIn(true);
  };

  const value = {
    isLoaded: true,
    isSignedIn,
    user: isSignedIn ? user : null,
    userId: isSignedIn ? user.id : null,
    getToken: async () => 'mock-clerk-token',
    signOut,
    openSignIn,
  };

  return (
    <MockClerkContext.Provider value={value}>
      {children}
    </MockClerkContext.Provider>
  );
}

function useMockUser() {
  const ctx = useContext(MockClerkContext);
  if (!ctx) return { isLoaded: true, isSignedIn: false, user: null };
  return {
    isLoaded: ctx.isLoaded,
    isSignedIn: ctx.isSignedIn,
    user: ctx.user,
  };
}

function useMockClerk() {
  const ctx = useContext(MockClerkContext);
  if (!ctx) return { signOut: async () => {}, openSignIn: () => {} };
  return {
    signOut: ctx.signOut,
    openSignIn: ctx.openSignIn,
  };
}

function useMockAuth() {
  const ctx = useContext(MockClerkContext);
  if (!ctx) return { isLoaded: true, isSignedIn: false, userId: null, getToken: async () => null };
  return {
    isLoaded: ctx.isLoaded,
    isSignedIn: ctx.isSignedIn,
    userId: ctx.userId,
    getToken: ctx.getToken,
  };
}

export const useUser = isClerkConfigured ? RealClerk.useUser : useMockUser;
export const useClerk = isClerkConfigured ? RealClerk.useClerk : useMockClerk;
export const useAuth = isClerkConfigured ? RealClerk.useAuth : useMockAuth;
