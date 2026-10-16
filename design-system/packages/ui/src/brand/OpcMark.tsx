import { useEffect, useRef, type CSSProperties, type HTMLAttributes } from "react";
import { classNames } from "../internal/classNames";
import { startBrandPlayback } from "./brandPlayback";
import styles from "./brand.module.css";

export interface OpcMarkProps extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  /** Omit when adjacent text already names the product. */
  label?: string;
  size?: CSSProperties["width"];
  motion?: "none" | "breathe";
  active?: boolean;
}

/** The authored transparent mark; currentColor follows the consuming surface. */
export function OpcMark({ label, size, motion = "none", active = true, className, style, ...props }: OpcMarkProps) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element || !active || motion === "none") return;
    return startBrandPlayback(element, () => [element.animate([
      { transform: "scale(0.99)" }, { transform: "scale(1)" }, { transform: "scale(0.99)" },
    ], { duration: 3200, iterations: Infinity, easing: "ease-in-out" })]);
  }, [active, motion]);
  return <span {...props} ref={ref} className={classNames(styles.mark, className)}
    style={{ width: size, height: size, ...style }} role={label ? "img" : undefined}
    aria-label={label} aria-hidden={label ? undefined : true}
    data-opc-component="opc-mark" data-opc-part="root"
    data-opc-motion={motion} data-opc-active={active} />;
}
