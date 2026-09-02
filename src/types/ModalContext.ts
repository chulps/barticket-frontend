import { createContext } from "react";
import type { ReactNode } from "react";

export type ModalOptions = {
  title?: ReactNode;
  content: ReactNode;
  closeStyle?: "icon" | "button" | "none";
  closeText?: string;
  maxWidth?: string;
};

export type ModalContextType = {
  modal: ModalOptions | null;
  openModal: (options: ModalOptions) => void;
  closeModal: () => void;
};

export const ModalContext =
  createContext<ModalContextType | null>(null);