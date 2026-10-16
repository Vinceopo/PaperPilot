import Svg, { Circle, Path, Rect } from "react-native-svg";

function StrokeIcon({ size, color, strokeWidth = 2, children }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </Svg>
  );
}

export function SearchIcon({ size = 16, color = "#94a3b8" }) {
  return (
    <StrokeIcon size={size} color={color}>
      <Circle cx={11} cy={11} r={8} />
      <Path d="m21 21-4.3-4.3" />
    </StrokeIcon>
  );
}

export function FilterIcon({ size = 14, color = "#475569" }) {
  return (
    <StrokeIcon size={size} color={color}>
      <Path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
    </StrokeIcon>
  );
}

export function UploadIcon({ size = 14, color = "#ffffff" }) {
  return (
    <StrokeIcon size={size} color={color}>
      <Path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <Path d="m17 8-5-5-5 5" />
      <Path d="M12 3v12" />
    </StrokeIcon>
  );
}

export function TrashIcon({ size = 16, color = "#64748b" }) {
  return (
    <StrokeIcon size={size} color={color}>
      <Path d="M3 6h18" />
      <Path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <Path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <Path d="M10 11v6M14 11v6" />
    </StrokeIcon>
  );
}

export function LockIcon({ size = 14, color = "#94a3b8" }) {
  return (
    <StrokeIcon size={size} color={color}>
      <Rect x={3} y={11} width={18} height={11} rx={2} />
      <Path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </StrokeIcon>
  );
}

export function ClockIcon({ size = 14, color = "#64748b" }) {
  return (
    <StrokeIcon size={size} color={color}>
      <Circle cx={12} cy={12} r={10} />
      <Path d="M12 6v6l4 2" />
    </StrokeIcon>
  );
}

export function CloseIcon({ size = 16, color = "#64748b" }) {
  return (
    <StrokeIcon size={size} color={color}>
      <Path d="M18 6 6 18M6 6l12 12" />
    </StrokeIcon>
  );
}

export function ChevronRightIcon({ size = 16, color = "#64748b" }) {
  return (
    <StrokeIcon size={size} color={color}>
      <Path d="m9 18 6-6-6-6" />
    </StrokeIcon>
  );
}

export function ChevronDownIcon({ size = 14, color = "#64748b" }) {
  return (
    <StrokeIcon size={size} color={color}>
      <Path d="m6 9 6 6 6-6" />
    </StrokeIcon>
  );
}

export function ArrowLeftIcon({ size = 14, color = "#109b89" }) {
  return (
    <StrokeIcon size={size} color={color} strokeWidth={2.5}>
      <Path d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
    </StrokeIcon>
  );
}

export function TriangleAlertIcon({ size = 24, color = "#f59e0b" }) {
  return (
    <StrokeIcon size={size} color={color}>
      <Path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
      <Path d="M12 9v4M12 17h.01" />
    </StrokeIcon>
  );
}

export function PencilIcon({ size = 16, color = "#94a3b8" }) {
  return (
    <StrokeIcon size={size} color={color} strokeWidth={1.8}>
      <Path d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
    </StrokeIcon>
  );
}

export function PadlockIcon({ size = 16, color = "#ffffff" }) {
  return (
    <StrokeIcon size={size} color={color} strokeWidth={1.8}>
      <Path d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
    </StrokeIcon>
  );
}

export function CameraIcon({ size = 14, color = "#e2e8f0" }) {
  return (
    <StrokeIcon size={size} color={color}>
      <Path d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
      <Path d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
    </StrokeIcon>
  );
}

export function EyeIcon({ size = 16, color = "#94a3b8", off = false }) {
  return (
    <StrokeIcon size={size} color={color} strokeWidth={1.8}>
      {off ? (
        <Path d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
      ) : (
        <>
          <Path d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
          <Path d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
        </>
      )}
    </StrokeIcon>
  );
}

export function DownloadIcon({ size = 14, color = "#ffffff" }) {
  return (
    <StrokeIcon size={size} color={color}>
      <Path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <Path d="m7 10 5 5 5-5" />
      <Path d="M12 15V3" />
    </StrokeIcon>
  );
}

export function MenuIcon({ size = 16, color = "#475569" }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function BellIcon({ size = 20, color = "#475569" }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 2a7 7 0 0 0-7 7v.7c0 1.5-.4 3-.9 4.3l-.5 1.2a1 1 0 0 0 .9 1.4h15a1 1 0 0 0 .9-1.4l-.5-1.2A11 11 0 0 1 19 9.7V9a7 7 0 0 0-7-7Zm0 20a3 3 0 0 0 2.8-2H9.2A3 3 0 0 0 12 22Z"
        fill={color}
      />
    </Svg>
  );
}

export function ChevronLeftIcon({ size = 14, color = "#64748b" }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M15.75 19.5L8.25 12l7.5-7.5"
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
