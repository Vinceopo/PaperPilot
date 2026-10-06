import { Image } from "expo-image";

/** Animated document loader for mechanics and manuscript upload/processing states. */
export default function DocumentLoader({ size = 96 }) {
  return (
    <Image
      source={require("../../../assets/document-loader.webp")}
      style={{ width: size, height: size }}
      contentFit="contain"
      autoplay
      accessible={false}
    />
  );
}
