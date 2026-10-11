export default function About() {
  return (
    <div style={{ maxWidth: 780 }} className="stack">
      <div className="head" style={{ marginBottom: 0 }}>
        <div>
          <h1>How it works</h1>
          <p>A small tool for one of the most common jobs in a billing office: figuring out why a claim was paid the way it was.</p>
        </div>
      </div>

      <div className="panel pad stack">
        <h2>The two files</h2>
        <p><b className="mono">837P</b> is the professional claim a practice sends: who the patient is, which payer, the diagnoses (ICD-10-CM) and each billed service with its charge and diagnosis pointers.</p>
        <p><b className="mono">835</b> is the electronic remittance advice the payer sends back: how much was paid, and for every dollar that was not paid, a <b>group code</b> (CO, PR, OA, PI) plus a <b>claim adjustment reason code</b> (CARC), often with <b>remark codes</b> (RARC) for detail.</p>
      </div>

      <div className="panel pad stack">
        <h2>Checks it runs</h2>
        <ul style={{ paddingLeft: 20, margin: 0 }}>
          <li>Reads the delimiters from the ISA header, so any valid interchange parses.</li>
          <li>Envelope: SE01 segment count, ST/SE and ISA/IEA control numbers.</li>
          <li>835 balancing: claim charge − all adjustments = claim paid; line charge − line adjustments = line paid; service lines add up to the claim; sum of claim payments − provider adjustments (PLB) = the payment amount in BPR02; patient responsibility in CLP05 equals the PR adjustments.</li>
          <li>837P: claim total equals the sum of line charges, diagnosis pointers point at real diagnoses, the first diagnosis is marked principal, every line has a service date, and the billing NPI passes its check digit.</li>
        </ul>
      </div>

      <div className="panel pad stack">
        <h2>Where the content comes from</h2>
        <ul style={{ paddingLeft: 20, margin: 0 }}>
          <li>CARC and RARC code numbers and status come from the published <a href="https://x12.org/codes" target="_blank" rel="noreferrer">X12 code lists</a>. The explanations are this project's own plain-language text: drafted with one language model and checked by a second against the official definitions. For the official wording, follow the link in each code.</li>
          <li>Procedure labels are short descriptions written for this demo; official CPT® descriptors are copyrighted by the AMA and are not included. ICD-10-CM descriptions are public domain.</li>
          <li>All patients, the practice and the payers are fictional. The sample files and the analytics dataset are generated in your browser from a fixed seed.</li>
        </ul>
      </div>

      <div className="panel pad stack">
        <h2>Built with</h2>
        <p>React, TypeScript and Vite. No backend: parsing and analytics run entirely client-side, so real files never leave the browser.</p>
        <p className="small muted">Not a clearinghouse or a compliance tool. For learning and demonstration.</p>
      </div>
    </div>
  )
}
