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