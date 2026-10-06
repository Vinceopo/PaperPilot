import LottieView from "lottie-react-native";

/** Paper plane gliding past clouds — workspace loading state. */
export default function PaperPlaneLoader({ width = 224, height = 128 }) {
  return (
    <LottieView
      source={require("../../../assets/paper-plane.json")}
      autoPlay
      loop
      style={{ width, height }}
    />
  );
}
