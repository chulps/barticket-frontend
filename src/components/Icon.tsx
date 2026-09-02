// src/components/Icon.tsx

import * as PhosphorIcons from "@phosphor-icons/react";
import type { CSSProperties } from "react";

type IconProps = {
  name: keyof typeof PhosphorIcons;
  size?: number | string;
  color?: string;
  hoverColor?: string;
  weight?:
    | "thin"
    | "light"
    | "regular"
    | "bold"
    | "fill"
    | "duotone";
  style?: CSSProperties;
  className?: string;
};

export default function Icon({
  name,
  size = "var(--font-size-h4)",
  color = "currentColor",
  weight = "regular",
  style,
  className
}: IconProps) {
  const Component =
    PhosphorIcons[name] as React.ElementType;

  if (!Component) return null;

  return (
    <Component
      size={size}
      color={color}
      weight={weight}
      style={{
        transition: "0.2s ease",
        ...style,
      }}
      className={className}
    />
  );
}