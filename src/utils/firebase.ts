import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, updateProfile } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, updateDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { getAnalytics, logEvent } from 'firebase/analytics';

// Ensure all required environment variables are present
const requiredEnvVars = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
  'VITE_FIREBASE_MEASUREMENT_ID'
];

for (const envVar of requiredEnvVars) {
  if (!import.meta.env[envVar]) {
    console.error(`Missing required environment variable: ${envVar}`);
  }
}

const currentDomain = window.location.hostname;
const isProduction = currentDomain === 'whatcanicookai.netlify.app';
const authDomain = isProduction 
  ? currentDomain 
  : import.meta.env.VITE_FIREBASE_AUTH_DOMAIN;

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

// Initialize Firebase only if we have all required config
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const analytics = getAnalytics(app);

// Analytics event logging helper
export const logAnalyticsEvent = (eventName: string, eventParams?: Record<string, any>) => {
  try {
    logEvent(analytics, eventName, eventParams);
  } catch (error) {
    console.error('Failed to log analytics event:', error);
  }
};

export interface UserData {
  username: string;
  email: string;
  isPremium: boolean;
  premiumSince?: string;
  stripeSessionId?: string;
  stripeSubscriptionActive?: boolean;
  stripeCustomerId?: string;
  savedRecipes: any[];
  mealPlans: any[];
  preferences: {
    dietaryRestrictions: string[];
    servingSize: number;
    theme: 'light' | 'dark';
  };
  lastVerified?: string;
  createdAt: string;
  updatedAt: string;
}

export const getUserData = async (userId: string, forceRefresh = false): Promise<UserData> => {
  try {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      throw new Error('User document not found');
    }

    const userData = userDoc.data() as UserData;
    
    if (forceRefresh) {
      const verificationResult = await verifyPremiumStatus(userId);
      if (verificationResult.isPremium !== userData.isPremium) {
        await updateDoc(userRef, {
          isPremium: verificationResult.isPremium,
          lastVerified: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        return { ...userData, isPremium: verificationResult.isPremium };
      }
    }
    
    return userData;
  } catch (error) {
    console.error('Error getting user data:', error);
    throw error;
  }
};

export const addPremiumUser = async (email: string) => {
  if (!email) {
    throw new Error('Email is required');
  }

  try {
    const normalizedEmail = email.toLowerCase();
    
    if (!auth.currentUser) {
      throw new Error('No authenticated user found');
    }

    const userId = auth.currentUser.uid;
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);

    if (!userDoc.exists()) {
      throw new Error('User document not found');
    }

    const premiumUsersRef = collection(db, 'premiumUsers');
    const q = query(premiumUsersRef, where('email', '==', normalizedEmail));
    const querySnapshot = await getDocs(q);

    let premiumDocId;

    if (!querySnapshot.empty) {
      premiumDocId = querySnapshot.docs[0].id;
      await updateDoc(doc(premiumUsersRef, premiumDocId), {
        active: true,
        updatedAt: new Date().toISOString(),
        stripeSubscriptionActive: true,
        userId: userId
      });
    } else {
      const premiumUserData = {
        email: normalizedEmail,
        userId: userId,
        active: true,
        stripeSubscriptionActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const docRef = doc(premiumUsersRef);
      await setDoc(docRef, premiumUserData);
      premiumDocId = docRef.id;
    }

    await updateDoc(userRef, {
      isPremium: true,
      premiumSince: new Date().toISOString(),
      email: normalizedEmail,
      premiumDocId,
      stripeSubscriptionActive: true,
      updatedAt: new Date().toISOString(),
      lastVerified: new Date().toISOString()
    });

    logAnalyticsEvent('premium_user_added', {
      userId,
      email: normalizedEmail,
      timestamp: new Date().toISOString()
    });

    const verificationResult = await verifyPremiumStatus(userId);
    if (!verificationResult.isPremium) {
      throw new Error('Premium status verification failed after update');
    }

    return true;
  } catch (error) {
    console.error('Error in addPremiumUser:', error);
    throw error;
  }
};

export const verifyPremiumStatus = async (userId: string) => {
  try {
    const userRef = doc(db, 'users', userId);
    const userData = await getDoc(userRef);
    
    if (!userData.exists()) {
      throw new Error('User not found');
    }
    
    const user = userData.data();
    
    const premiumUsersRef = collection(db, 'premiumUsers');
    const q = query(
      premiumUsersRef,
      where('email', '==', user.email.toLowerCase()),
      where('active', '==', true),
      where('stripeSubscriptionActive', '==', true)
    );
    
    const querySnapshot = await getDocs(q);
    const isPremium = !querySnapshot.empty;
    
    await updateDoc(userRef, {
      isPremium,
      lastVerified: new Date().toISOString(),
      stripeSubscriptionActive: isPremium,
      updatedAt: new Date().toISOString()
    });

    logAnalyticsEvent('premium_status_verified', {
      userId,
      isPremium,
      timestamp: new Date().toISOString()
    });
    
    return {
      isPremium,
      lastVerified: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error verifying premium status:', error);
    return {
      isPremium: false,
      lastVerified: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

export const createUser = async (email: string, password: string, username: string) => {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(userCredential.user, { displayName: username });
    
    const isPremium = await verifyPremiumStatus(userCredential.user.uid);
    
    const userData: UserData = {
      username,
      email: email.toLowerCase(),
      isPremium: isPremium.isPremium,
      savedRecipes: [],
      mealPlans: [],
      preferences: {
        dietaryRestrictions: [],
        servingSize: 2,
        theme: 'light'
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await setDoc(doc(db, 'users', userCredential.user.uid), userData);

    logAnalyticsEvent('user_created', {
      userId: userCredential.user.uid,
      timestamp: new Date().toISOString()
    });

    return userCredential.user;
  } catch (error: any) {
    console.error('Error creating user:', error);
    if (error.code === 'auth/email-already-in-use') {
      throw new Error('This email is already registered. Please sign in instead.');
    }
    throw new Error(getAuthErrorMessage(error.code));
  }
};

export const signIn = async (email: string, password: string) => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    
    const verificationResult = await verifyPremiumStatus(userCredential.user.uid);
    
    await updateDoc(doc(db, 'users', userCredential.user.uid), {
      isPremium: verificationResult.isPremium,
      lastVerified: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    logAnalyticsEvent('user_signed_in', {
      userId: userCredential.user.uid,
      timestamp: new Date().toISOString()
    });
    
    return userCredential.user;
  } catch (error: any) {
    console.error('Sign in error:', error);
    throw new Error(getAuthErrorMessage(error.code));
  }
};

export const signOutUser = async () => {
  try {
    const userId = auth.currentUser?.uid;
    await signOut(auth);
    
    if (userId) {
      logAnalyticsEvent('user_signed_out', {
        userId,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('Error signing out:', error);
    throw new Error('Failed to sign out. Please try again.');
  }
};

export const updateUserData = async (userId: string, data: Partial<UserData>) => {
  try {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      ...data,
      updatedAt: new Date().toISOString()
    });

    logAnalyticsEvent('user_data_updated', {
      userId,
      updatedFields: Object.keys(data),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error updating user data:', error);
    throw new Error('Failed to update user data. Please try again.');
  }
};

const getAuthErrorMessage = (errorCode: string): string => {
  switch (errorCode) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Invalid email or password. Please try again.';
    case 'auth/email-already-in-use':
      return 'This email is already registered. Please sign in instead.';
    case 'auth/weak-password':
      return 'Password should be at least 6 characters long.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/too-many-requests':
      return 'Too many failed attempts. Please try again later.';
    case 'auth/network-request-failed':
      return 'Network error. Please check your connection and try again.';
    default:
      return 'An error occurred. Please try again.';
  }
};