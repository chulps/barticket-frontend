// src/components/Icon.tsx

import * as PhosphorIcons from "@phosphor-icons/react";
import { useState } from "react";
import type { CSSProperties } from "react";

type IconProps = {
  name: keyof typeof PhosphorIcons;
  size?: number;
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
};

export default function Icon({
  name,
  size = 24,
  color = "#ffffff",
  hoverColor,
  weight = "regular",
  style,
}: IconProps) {
  const [isHovered, setIsHovered] = useState(false);

  const Component =
    PhosphorIcons[name] as React.ElementType;

  if (!Component) {
    return null;
  }

  return (
    <Component
      size={size}
      color={
        isHovered && hoverColor
          ? hoverColor
          : color
      }
      weight={weight}
      style={{
        transition: "0.2s ease",
        cursor: "pointer",
        ...style,
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    />
  );
}