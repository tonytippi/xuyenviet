type BrandMarkProps = {
  className?: string;
};

export function BrandMark({ className = "" }: BrandMarkProps) {
  return (
    // SVG keeps the mark sharp from the compact sidebar through app-icon sizes.
    // eslint-disable-next-line @next/next/no-img-element
    <img alt="" aria-hidden="true" className={className} src="/brand/xuyenviet-mark.svg" />
  );
}
