import { createContext } from "react";
import type { ModalContextType } from "./ModalProvider";

export const ModalContext =
  createContext<ModalContextType | null>(null);