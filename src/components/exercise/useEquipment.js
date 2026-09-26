import { useEffect, useState } from "react";
import { readEquipment, EQUIPMENT_EVENT } from "../../lib/equipmentProfile.js";

/** The person's saved equipment ({ equipment, saved }), kept in step across open screens. */
export default function useEquipment() {
  const [state, setState] = useState(() => readEquipment());
  useEffect(() => {
    const on = () => setState(readEquipment());
    window.addEventListener(EQUIPMENT_EVENT, on);
    return () => window.removeEventListener(EQUIPMENT_EVENT, on);
  }, []);
  return state;
}
