import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Money, Part, Vendor } from '@mobile-marketplace/core';
import type { ICartStorage } from './cart-storage';
import { AsyncStorageCartStorage } from './cart-storage';
import type { CartItem, VendorCartGroup } from './cart.service';
import {
  addItemToCart,
  calculateCartSubtotal,
  groupCartItemsByVendor,
  removeItemFromCart,
} from './cart.service';

const CART_STORAGE_KEY = '@mobile_marketplace:cart_v1';

export interface CartContextValue {
  readonly items: readonly CartItem[];
  readonly itemCount: number;
  readonly subtotal: Money;
  readonly vendorGroups: readonly VendorCartGroup[];
  readonly isLoaded: boolean;
  isInCart(partId: string): boolean;
  addItem(part: Part, vendor: Vendor): { success: boolean; reason?: string };
  removeItem(partId: string): void;
  removeItems(partIds: readonly string[]): void;
  clearCart(): void;
}

const CartContext = createContext<CartContextValue | null>(null);

export interface CartProviderProps {
  readonly children: React.ReactNode;
  readonly storage?: ICartStorage;
}

export function CartProvider({ children, storage }: CartProviderProps) {
  const [items, setItems] = useState<readonly CartItem[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  const cartStorage = useMemo(() => storage ?? new AsyncStorageCartStorage(), [storage]);

  // Load from local storage on startup
  useEffect(() => {
    let isMounted = true;

    async function loadCart() {
      try {
        const raw = await cartStorage.getItem(CART_STORAGE_KEY);
        if (raw && isMounted) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            setItems(parsed);
          }
        }
      } catch {
        // Fallback to empty cart on parsing error
      } finally {
        if (isMounted) {
          setIsLoaded(true);
        }
      }
    }

    loadCart();

    return () => {
      isMounted = false;
    };
  }, [cartStorage]);

  // Persist items whenever they change (after initial load)
  useEffect(() => {
    if (!isLoaded) return;

    cartStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items)).catch(() => {
      // Storage error handled gracefully
    });
  }, [items, isLoaded, cartStorage]);

  const isInCart = (partId: string): boolean => {
    return items.some((item) => item.part.id === partId);
  };

  const addItem = (part: Part, vendor: Vendor): { success: boolean; reason?: string } => {
    const result = addItemToCart(items, part, vendor);
    if (result.added) {
      setItems(result.items);
      return { success: true };
    }
    return { success: false, reason: result.reason };
  };

  const removeItem = (partId: string) => {
    setItems((prev) => removeItemFromCart(prev, partId));
  };

  const removeItems = (partIds: readonly string[]) => {
    const idSet = new Set(partIds);
    setItems((prev) => Object.freeze(prev.filter((item) => !idSet.has(item.part.id))));
  };

  const clearCart = () => {
    setItems([]);
    cartStorage.removeItem(CART_STORAGE_KEY).catch(() => {});
  };

  const subtotal = useMemo(() => calculateCartSubtotal(items), [items]);
  const vendorGroups = useMemo(() => groupCartItemsByVendor(items), [items]);

  const value: CartContextValue = {
    items,
    itemCount: items.length,
    subtotal,
    vendorGroups,
    isLoaded,
    isInCart,
    addItem,
    removeItem,
    removeItems,
    clearCart,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
