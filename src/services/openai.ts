import OpenAI from 'openai';
import { logAnalyticsEvent } from './analytics';
import { type Ingredient } from '../types/recipe';

const openai = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true
});

export async function generateRecipe(ingredients: Ingredient[]) {
  const ingredientList = ingredients.map(ing => ing.name).join(', ');
  const timestamp = Date.now();
  
  try {
    const completion = await openai.chat.completions.create({
      messages: [{
        role: "system",
        content: `You are a helpful chef that suggests recipes based on available ingredients. Current timestamp: ${timestamp}. Always provide unique suggestions. Respond in JSON format with the following structure: { name: string, cookTime: number, servings: number, ingredients: string[], instructions: string[] }`
      }, {
        role: "user",
        content: `Suggest a unique recipe I can make with some or all of these ingredients: ${ingredientList}. Include additional common ingredients if needed.`
      }],
      model: "gpt-3.5-turbo",
      response_format: { type: "json_object" },
      temperature: 0.9,
      presence_penalty: 0.6,
      frequency_penalty: 0.6
    });

    const recipe = JSON.parse(completion.choices[0].message.content);

    logAnalyticsEvent('recipe_generated', {
      ingredientCount: ingredients.length,
      timestamp: new Date().toISOString()
    });

    return recipe;
  } catch (error) {
    console.error('Error generating recipe:', error);
    logAnalyticsEvent('recipe_generation_error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
    throw error;
  }
}

export async function generateCustomRecipe(prompt: string) {
  const timestamp = Date.now();
  
  try {
    const completion = await openai.chat.completions.create({
      messages: [{
        role: "system",
        content: `You are a professional chef providing detailed cooking instructions. Current timestamp: ${timestamp}. Always provide unique suggestions. Format your response with clear sections for ingredients (with exact measurements) and step-by-step instructions.`
      }, {
        role: "user",
        content: prompt
      }],
      model: "gpt-3.5-turbo",
      temperature: 0.9,
      presence_penalty: 0.6,
      frequency_penalty: 0.6
    });

    logAnalyticsEvent('custom_recipe_generated', {
      timestamp: new Date().toISOString()
    });

    return completion.choices[0].message.content;
  } catch (error) {
    console.error('Error generating custom recipe:', error);
    logAnalyticsEvent('custom_recipe_generation_error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
    throw error;
  }
}

export async function generateMealPlan(): Promise<Array<{
  breakfast: string;
  lunch: string;
  dinner: string;
}>> {
  const timestamp = Date.now();
  
  try {
    const completion = await openai.chat.completions.create({
      messages: [{
        role: "system",
        content: `You are a nutritionist creating weekly meal plans. Current timestamp: ${timestamp}. Always provide unique suggestions. Respond in JSON format with the following structure:
        {
          "weeklyPlan": [
            {
              "breakfast": "Meal name",
              "lunch": "Meal name",
              "dinner": "Meal name"
            }
          ]
        }
        Generate 7 days of unique, creative meals.`
      }, {
        role: "user",
        content: "Generate a balanced weekly meal plan with variety and nutrition in mind."
      }],
      model: "gpt-3.5-turbo",
      response_format: { type: "json_object" },
      temperature: 0.9,
      presence_penalty: 0.6,
      frequency_penalty: 0.6
    });

    const response = JSON.parse(completion.choices[0].message.content);
    
    logAnalyticsEvent('meal_plan_generated', {
      timestamp: new Date().toISOString()
    });

    if (!response.weeklyPlan || !Array.isArray(response.weeklyPlan)) {
      throw new Error('Invalid meal plan format received');
    }

    return response.weeklyPlan;
  } catch (error) {
    console.error('Error generating meal plan:', error);
    logAnalyticsEvent('meal_plan_generation_error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
    throw new Error('Failed to generate meal plan. Please try again.');
  }
}

export async function generateShoppingList(meals: string[]): Promise<Array<{
  category: string;
  items: string[];
}>> {
  const timestamp = Date.now();
  
  try {
    const completion = await openai.chat.completions.create({
      messages: [{
        role: "system",
        content: `You are a helpful chef creating organized shopping lists. Current timestamp: ${timestamp}. Given a list of meals and servings, create a categorized shopping list with exact quantities. 
        Respond in JSON format with the following structure:
        {
          "shoppingList": [
            {
              "category": "Category name",
              "items": ["2 lbs chicken breast", "1 gallon milk", etc.]
            }
          ]
        }
        Categories should include: Produce, Meat & Seafood, Dairy & Eggs, Pantry, Grains & Bread, Frozen, Condiments & Spices.
        Always specify quantities in common measurements (cups, ounces, pounds, etc.).`
      }, {
        role: "user",
        content: `Create a detailed shopping list with exact quantities for these meals: ${meals.join(', ')}`
      }],
      model: "gpt-3.5-turbo",
      response_format: { type: "json_object" },
      temperature: 0.9,
      presence_penalty: 0.6,
      frequency_penalty: 0.6
    });

    const response = JSON.parse(completion.choices[0].message.content);

    logAnalyticsEvent('shopping_list_generated', {
      mealCount: meals.length,
      timestamp: new Date().toISOString()
    });

    if (!response.shoppingList || !Array.isArray(response.shoppingList)) {
      throw new Error('Invalid shopping list format received');
    }

    return response.shoppingList;
  } catch (error) {
    console.error('Error generating shopping list:', error);
    logAnalyticsEvent('shopping_list_generation_error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
    throw new Error('Failed to generate shopping list. Please try again.');
  }
}