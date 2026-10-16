import LottieView from "lottie-react-native";

/** Looping "paper under review" animation shown while a manuscript is being analysed. */
export default function PaperRollAnimation({ size = 176 }) {
  return (
    <LottieView
      source={require("../../../assets/paper-roll.json")}
      autoPlay
      loop
      style={{ width: size, height: size }}
    />
  );
}
