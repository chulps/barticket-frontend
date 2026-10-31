import {
  ArchiveIcon,
  ArrowCounterClockwiseIcon,
  ArrowLeftIcon,
  BellIcon,
  BookIcon,
  CalendarBlankIcon,
  CalendarIcon,
  CaretDownIcon,
  CaretLeftIcon,
  CaretRightIcon,
  CaretUpIcon,
  ChartDonutIcon,
  CheckCircleIcon,
  CheckIcon,
  CopyIcon,
  CreditCardIcon,
  CurrencyCircleDollarIcon,
  DotsThreeOutlineVerticalIcon,
  DownloadSimpleIcon,
  EnvelopeSimpleIcon,
  GearSixIcon,
  HandCoinsIcon,
  HashIcon,
  ListDashesIcon,
  ListIcon,
  MinusIcon,
  MoneyIcon,
  PencilSimpleIcon,
  PlusIcon,
  TranslateIcon,
  TrashIcon,
  UserCircleIcon,
  WalletIcon,
  WarningIcon,
  XIcon,
} from "@phosphor-icons/react";
import type { CSSProperties } from "react";

const iconComponents = {
  Archive: ArchiveIcon,
  ArrowCounterClockwise: ArrowCounterClockwiseIcon,
  ArrowLeft: ArrowLeftIcon,
  Bell: BellIcon,
  Book: BookIcon,
  Calendar: CalendarIcon,
  CalendarBlank: CalendarBlankIcon,
  CaretDown: CaretDownIcon,
  CaretLeft: CaretLeftIcon,
  CaretRight: CaretRightIcon,
  CaretUp: CaretUpIcon,
  ChartDonut: ChartDonutIcon,
  Check: CheckIcon,
  CheckCircle: CheckCircleIcon,
  Copy: CopyIcon,
  CreditCard: CreditCardIcon,
  CurrencyCircleDollar: CurrencyCircleDollarIcon,
  DotsThreeOutlineVertical: DotsThreeOutlineVerticalIcon,
  DownloadSimple: DownloadSimpleIcon,
  EnvelopeSimple: EnvelopeSimpleIcon,
  GearSix: GearSixIcon,
  HandCoins: HandCoinsIcon,
  Hash: HashIcon,
  List: ListIcon,
  ListDashes: ListDashesIcon,
  Minus: MinusIcon,
  Money: MoneyIcon,
  PencilSimple: PencilSimpleIcon,
  Plus: PlusIcon,
  Translate: TranslateIcon,
  Trash: TrashIcon,
  UserCircle: UserCircleIcon,
  Wallet: WalletIcon,
  Warning: WarningIcon,
  X: XIcon,
} as const;

type IconName = keyof typeof iconComponents;

type IconProps = {
  name: IconName;
  size?: number | string;
  color?: string;
  hoverColor?: string;
  weight?: "thin" | "light" | "regular" | "bold" | "fill" | "duotone";
  style?: CSSProperties;
  className?: string;
};

export default function Icon({
  name,
  size = "var(--font-size-h4)",
  color = "currentColor",
  weight = "regular",
  style,
  className,
}: IconProps) {
  const Component = iconComponents[name];

  return (
    <Component
      size={size}
      color={color}
      weight={weight}
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        transition: "0.2s ease",
        ...style,
      }}
      className={className}
    />
  );
}
