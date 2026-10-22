import { Chapter } from "../components/ui";

function FlowDiagram() {
  const sup = [
    { y: 34, name: "Zeiss", mod: "projection optics" },
    { y: 104, name: "Cymer", mod: "light source" },
    { y: 174, name: "Trumpf", mod: "drive laser" },
  ];
  return (
    <svg viewBox="0 0 860 250" className="h-auto w-full" role="img"
      aria-label="Three single-source suppliers feed buffer stock, ASML assembles one of each into a system and ships against orders; late orders queue; a shared stress factor raises supplier failures and demand together.">
      <defs>
        <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0L10,5L0,10z" fill="var(--muted)" />
        </marker>
      </defs>
      <g fontSize="12" fill="var(--ink)">
        <text x="6" y="16" fontSize="10.5" fill="var(--faint)">SUPPLIERS · single source</text>
        {sup.map((s) => (
          <g key={s.name}>
            <rect x="6" y={s.y} width="170" height="46" fill="var(--surface)" stroke="var(--line)" />
            <text x="18" y={s.y + 20} fontWeight="600">{s.name}</text>
            <text x="18" y={s.y + 36} fill="var(--muted)" fontSize="11">{s.mod}</text>
            <path d={`M176,${s.y + 23} H246`} stroke="var(--muted)" strokeWidth="1.5" markerEnd="url(#arr)" />
            <rect x="250" y={s.y + 8} width="96" height="30" fill="var(--accent-soft)" stroke="var(--accent)" />
            <text x="298" y={s.y + 27} textAnchor="middle" fontSize="11">buffer stock</text>
            <path d={`M346,${s.y + 23} C380,${s.y + 23} 380,127 414,127`} fill="none" stroke="var(--muted)" strokeWidth="1.5" markerEnd="url(#arr)" />
          </g>
        ))}
        <text x="252" y="16" fontSize="10.5" fill="var(--faint)">DECISION</text>
        <rect x="418" y="92" width="170" height="70" fill="var(--surface)" stroke="var(--line)" />
        <text x="430" y="116" fontWeight="600">ASML, Veldhoven</text>
        <text x="430" y="133" fill="var(--muted)" fontSize="11">one of each → a system</text>
        <text x="430" y="148" fill="var(--muted)" fontSize="11">limited by bays (capacity)</text>
        <path d="M588,127 H668" stroke="var(--muted)" strokeWidth="1.5" markerEnd="url(#arr)" />
        <rect x="672" y="92" width="180" height="70" fill="var(--surface)" stroke="var(--line)" />
        <text x="684" y="116" fontWeight="600">Chipmakers</text>
        <text x="684" y="133" fill="var(--muted)" fontSize="11">orders due each month</text>
        <text x="684" y="148" fill="var(--muted)" fontSize="11">revenue → DCF value</text>
        <path d="M762,162 C762,214 520,214 503,166" fill="none" stroke="var(--muted)" strokeWidth="1.5" strokeDasharray="4 3" markerEnd="url(#arr)" />
        <text x="640" y="228" textAnchor="middle" fill="var(--muted)" fontSize="11">unshipped orders wait (a few cancel)</text>
        <text x="430" y="34" fontSize="10.5" fill="var(--faint)">SHARED DRIVER</text>
        <rect x="418" y="42" width="434" height="28" fill="none" stroke="var(--line)" strokeDasharray="4 3" />
        <text x="635" y="60" textAnchor="middle" fill="var(--muted)" fontSize="11">industry stress: more outages, lower yields and more orders, together</text>
      </g>
    </svg>
  );
}

export function Plain() {
  return (
    <Chapter id="idea" n="01" kicker="In plain language" title="A system ships only when all three modules are there"
      lede={<>
        Each EUV scanner needs one projection optics set, one light source and one drive laser. Every month each supplier produces
        modules. Some fail qualification, and now and then a supplier is hit by an outage (a fire, a broken tool, an export problem)
        that cuts its output for weeks or months. ASML combines one of each into a system, limited by how many integration bays it
        has, and ships against its order book.
      </>}>
      <div className="border border-line p-3 sm:p-5"><FlowDiagram /></div>
      <div className="prose-body mt-6 grid gap-x-10 md:grid-cols-2">
        <div>
          <p><strong>The decision.</strong> How many spare modules of each type ASML should keep (the buffer). A spare module
            lets ASML ship on time when a supplier stumbles. It also ties up cash, costs money to store and re-qualify, and can become
            obsolete.</p>
          <p><strong>Why this is not obvious.</strong> ASML is the only company that sells EUV machines. A customer whose machine is late
            mostly waits; very few cancel. A shortfall therefore mostly <em>delays</em> revenue instead of destroying it. The value at stake is the time value of
            money plus the few lost orders and the cost of idle capacity. That is much less than the sticker price of the late machines.</p>
        </div>
        <div>
          <p><strong>Why simulate.</strong> Outages are rare and lumpy, modules are discrete (you cannot ship 0.6 of a laser), and the
            bad events cluster. When the chip industry is booming, orders peak just as suppliers are most stretched. Average-case
            spreadsheets miss exactly the scenarios where buffers matter.</p>
          <p><strong>How value is measured.</strong> Each simulated path's shipments replace the plan in the Base case of my ASML
            DCF. That gives an equity value for each path and each buffer policy. Comparing policies on the <em>same</em> random paths
            isolates the effect of the policy from luck.</p>
        </div>
      </div>
    </Chapter>
  );
}
