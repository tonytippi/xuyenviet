import type { ComponentProps } from "react";

export type IconProps = ComponentProps<"svg">;

function Icon({ children, "aria-hidden": ariaHidden, "aria-label": ariaLabel, "aria-labelledby": ariaLabelledby, ...props }: IconProps) {
  return (
    <svg
      aria-hidden={ariaHidden ?? (ariaLabel || ariaLabelledby ? undefined : true)}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledby}
      fill="none"
      height="1em"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width="1em"
      {...props}
    >
      {children}
    </svg>
  );
}

export function AttachmentIcon(props: IconProps) {
  return <Icon {...props}><path d="m21.4 11.6-8.9 8.9a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5" /></Icon>;
}

export function SendIcon(props: IconProps) {
  return <Icon {...props}><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></Icon>;
}

export function CloseIcon(props: IconProps) {
  return <Icon {...props}><path d="m6 6 12 12M18 6 6 18" /></Icon>;
}

export function MenuIcon(props: IconProps) {
  return <Icon {...props}><path d="M4 6h16M4 12h16M4 18h16" /></Icon>;
}

export function ChatIcon(props: IconProps) {
  return <Icon {...props}><path d="M20 11.5a7.5 7.5 0 0 1-8 7.5 8.6 8.6 0 0 1-3.8-.9L4 20l1.8-4a7.4 7.4 0 0 1-1.3-4.2A7.5 7.5 0 0 1 12 4a7.5 7.5 0 0 1 8 7.5Z" /></Icon>;
}

export function NewChatIcon(props: IconProps) {
  return <Icon {...props}><path d="M12 20H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v5" /><path d="M8 10h4M8 14h2M19 16v6M16 19h6" /></Icon>;
}

export function ProjectIcon(props: IconProps) {
  return <Icon {...props}><path d="M3 7h7l2 3h9v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /><path d="M3 7a2 2 0 0 1 2-2h5l2 3" /></Icon>;
}

export function SourceIcon(props: IconProps) {
  return <Icon {...props}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6M8 13h8M8 17h6" /></Icon>;
}

export function AccountIcon(props: IconProps) {
  return <Icon {...props}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></Icon>;
}

export function LoadingIcon(props: IconProps) {
  return <Icon {...props}><path d="M20 12a8 8 0 1 1-2.3-5.7" /></Icon>;
}
