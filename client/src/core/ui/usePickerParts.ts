import { useOptionalSlot } from "../../themes/context";
import { Picker } from "./Picker";

export function usePickerParts() {
  return {
    Picker: useOptionalSlot("PickerFrame") ?? Picker,
  };
}
