import React from "react";
import BodyMap from "../components/BodyMap.jsx";
import { GROUP_LABEL } from "../lib/exerciseLibrary.js";
import { MUSCLE_MAP } from "../lib/muscleMap.generated.js";
import { heatFromWorkout, heatSentence, unknownNote, HEAT_WORD } from "../lib/muscleHeat.js";

// "What you worked" — the muscle picture on the receipt, after a client sends a
// workout from the link.
//
// It counts the sets they ticked, so a skipped exercise leaves its muscles cold.
// The muscle names are listed as text under the figures: that is the legend (a
// brighter dot means more work) and the detail at once, and it is what a screen
// reader reads, since the drawing itself is only a picture.
//
// Nothing here is a claim about training. It says which muscles the exercises they
// did are for — not that a muscle grew, needs rest, or is under-worked.

export default function MuscleHeat({ exercises }) {
  const heat = React.useMemo(() => heatFromWorkout(exercises, MUSCLE_MAP), [exercises]);
  if (!heat.worked.length) return null;          // nothing we can place: say nothing

  const sentence = heatSentence(heat);
  const note = unknownNote(heat);
  const spoken = heat.worked.map((g) => HEAT_WORD[g]).join(", ");

  return (
    <div className="lk-card lk-heat">
      <h3 className="lk-heat-h">What you worked</h3>
      <div className="lk-heat-figs">
        <BodyMap view="front" levels={heat.levels} width={104} stroke="#101010"
          label={`Front of body. Worked: ${spoken}`} />
        <BodyMap view="back" levels={heat.levels} width={104} stroke="#101010"
          label={`Back of body. Worked: ${spoken}`} />
      </div>
      {sentence && <p className="lk-heat-p">{sentence}</p>}
      <ul className="lk-heat-list">
        {heat.worked.map((g) => (
          <li key={g} className={`lk-heat-m l${heat.levels[g]}`}>
            <span className="lk-heat-dot" aria-hidden="true" />
            {GROUP_LABEL[g] || HEAT_WORD[g]}
          </li>
        ))}
      </ul>
      {note && <small className="lk-heat-note">{note}</small>}
    </div>
  );
}
