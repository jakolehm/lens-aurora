import { Svg, type SvgProps } from "@k8slens/element-components";
import { useId } from "react";

const CURVE = "M4 52 C18 54 20 32 32 32 S46 12 60 12";

/** The aurora of assets/icon.svg without its dark tile, so it sits on either theme. */
export const AuroraIcon = (props: SvgProps) => {
  const gradient = useId();

  return (
    <Svg viewBox="0 0 64 64" fill="none" {...props}>
      <defs>
        <linearGradient id={gradient} x1="4" y1="52" x2="60" y2="12" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#4ecb71" />
          <stop offset="0.5" stopColor="#2fbf9a" />
          <stop offset="1" stopColor="#5b83ff" />
        </linearGradient>
      </defs>
      <path d={CURVE} stroke={`url(#${gradient})`} strokeWidth="18" strokeLinecap="round" opacity="0.3" />
      <path d={CURVE} stroke={`url(#${gradient})`} strokeWidth="8" strokeLinecap="round" />
    </Svg>
  );
};
