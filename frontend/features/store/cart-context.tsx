"use client";

import { createContext, useContext, useReducer, useCallback, useEffect, useState, type ReactNode } from "react";

export interface CartItemState {
  id: string; // unique per cart entry
  type: "plan_change" | "addon" | "renewal" | "overage" | "ecf_blocks" | "entity_slot" | "user_slot";
  plan_name?: string;
  addon_type?: string;
  quantity: number;
  months?: number;
  price_cents: number;
  label: string;
}

type CartAction =
  | { type: "ADD_ITEM"; payload: CartItemState }
  | { type: "REMOVE_ITEM"; payload: { id: string } }
  | { type: "UPDATE_QUANTITY"; payload: { id: string; quantity: number } }
  | { type: "INIT_ITEMS"; payload: CartItemState[] }
  | { type: "CLEAR" };

interface CartState {
  items: CartItemState[];
}

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "INIT_ITEMS":
      return { items: action.payload };
    case "ADD_ITEM": {
      const existingIdx = state.items.findIndex(
        (i) =>
          i.type === action.payload.type &&
          i.plan_name === action.payload.plan_name &&
          i.addon_type === action.payload.addon_type,
      );
      if (existingIdx >= 0) {
        const items = [...state.items];
        items[existingIdx] = {
          ...items[existingIdx],
          quantity: items[existingIdx].quantity + action.payload.quantity,
        };
        return { items };
      }
      return { items: [...state.items, action.payload] };
    }
    case "REMOVE_ITEM":
      return { items: state.items.filter((i) => i.id !== action.payload.id) };
    case "UPDATE_QUANTITY":
      return {
        items: state.items.map((i) =>
          i.id === action.payload.id ? { ...i, quantity: action.payload.quantity } : i,
        ),
      };
    case "CLEAR":
      return { items: [] };
    default:
      return state;
  }
}

interface CartContextValue {
  items: CartItemState[];
  addItem: (item: Omit<CartItemState, "id">) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  itemCount: number;
  isEmpty: boolean;
}

const CartContext = createContext<CartContextValue | null>(null);

let _idCounter = 0;
function nextId() {
  return `cart_${++_idCounter}_${Date.now()}`;
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, { items: [] });
  const [isLoaded, setIsLoaded] = useState(false);

  // Load cart from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("fintral_cart");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            dispatch({ type: "INIT_ITEMS", payload: parsed });
          }
        } catch (e) {
          console.error("Error loading cart from localStorage", e);
        }
      }
      setIsLoaded(true);
    }
  }, []);

  // Save cart to localStorage when items update
  useEffect(() => {
    if (isLoaded && typeof window !== "undefined") {
      localStorage.setItem("fintral_cart", JSON.stringify(state.items));
    }
  }, [state.items, isLoaded]);

  const addItem = useCallback((item: Omit<CartItemState, "id">) => {
    dispatch({ type: "ADD_ITEM", payload: { ...item, id: nextId() } });
  }, []);

  const removeItem = useCallback((id: string) => {
    dispatch({ type: "REMOVE_ITEM", payload: { id } });
  }, []);

  const updateQuantity = useCallback((id: string, quantity: number) => {
    dispatch({ type: "UPDATE_QUANTITY", payload: { id, quantity } });
  }, []);

  const clearCart = useCallback(() => {
    dispatch({ type: "CLEAR" });
  }, []);

  const itemCount = state.items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        items: state.items,
        addItem,
        removeItem,
        updateQuantity,
        clearCart,
        itemCount,
        isEmpty: state.items.length === 0,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
