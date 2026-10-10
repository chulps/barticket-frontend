import { useState, type ReactNode } from "react";
import { ModalContext } from "./ModalContext";

export type ModalOptions = {
  title?: ReactNode;
  content: ReactNode;
  closeStyle?: "icon" | "button" | "none";
  closeText?: string;
  maxWidth?: string;
  fitContent?: boolean;
};

export type ModalContextType = {
  modal: ModalOptions | null;
  openModal: (options: ModalOptions) => void;
  closeModal: () => void;
};

export function ModalProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [modal, setModal] = useState<ModalOptions | null>(null);

  const openModal = (options: ModalOptions) => setModal(options);
  const closeModal = () => setModal(null);

  return (
    <ModalContext.Provider
      value={{ modal, openModal, closeModal }}
    >
      {children}
    </ModalContext.Provider>
  );
}