// Segment and element names for the X12 5010 837P / 835 segments this tool reads.
// Element lists are positional: index 0 = element 01.

export type SegDef = { name: string; elements: string[] }

export const SEGMENTS: Record<string, SegDef> = {
  ISA: { name: 'Interchange control header', elements: ['Authorization qualifier', 'Authorization info', 'Security qualifier', 'Security info', 'Sender ID qualifier', 'Sender ID', 'Receiver ID qualifier', 'Receiver ID', 'Date (YYMMDD)', 'Time', 'Repetition separator', 'Version', 'Control number', 'Ack requested', 'Usage (P=prod, T=test)', 'Component separator'] },
  GS: { name: 'Functional group header', elements: ['Functional ID (HC=837, HP=835)', 'Sender code', 'Receiver code', 'Date', 'Time', 'Group control number', 'Agency', 'Version / release'] },
  ST: { name: 'Transaction set header', elements: ['Transaction set (837 / 835)', 'Control number', 'Implementation guide'] },
  SE: { name: 'Transaction set trailer', elements: ['Segment count (ST through SE)', 'Control number'] },
  GE: { name: 'Functional group trailer', elements: ['Transaction set count', 'Group control number'] },
  IEA: { name: 'Interchange trailer', elements: ['Functional group count', 'Interchange control number'] },
  BHT: { name: 'Beginning of hierarchical transaction', elements: ['Structure code', 'Purpose (00=original)', 'Reference ID', 'Date', 'Time', 'Type (CH=chargeable)'] },
  NM1: { name: 'Name', elements: ['Entity (41=submitter, 40=receiver, 85=billing provider, IL=insured, QC=patient, PR=payer, 82=rendering, 77=facility, PE=payee)', 'Entity type (1=person, 2=organization)', 'Last / organization name', 'First name', 'Middle name', 'Prefix', 'Suffix', 'ID qualifier (XX=NPI, MI=member ID, PI=payer ID, FI=tax ID)', 'Identifier'] },
  N1: { name: 'Party identification', elements: ['Entity (PR=payer, PE=payee)', 'Name', 'ID qualifier', 'Identifier'] },
  N3: { name: 'Address', elements: ['Address line 1', 'Address line 2'] },
  N4: { name: 'City / state / ZIP', elements: ['City', 'State', 'ZIP code', 'Country'] },
  PER: { name: 'Contact', elements: ['Function', 'Name', 'Number qualifier', 'Number', 'Qualifier', 'Number'] },
  REF: { name: 'Reference identification', elements: ['Qualifier (EI=EIN, G1=prior auth, F8=original claim #, EV=receiver ID, 2U=payer ID, 6R=line item control #)', 'Reference value'] },
  HL: { name: 'Hierarchical level', elements: ['HL ID', 'Parent HL ID', 'Level (20=billing provider, 22=subscriber, 23=patient)', 'Has child levels (1/0)'] },
  PRV: { name: 'Provider information', elements: ['Provider role', 'Qualifier (PXC=taxonomy)', 'Taxonomy code'] },
  SBR: { name: 'Subscriber information', elements: ['Payer responsibility (P=primary, S=secondary, T=tertiary)', 'Relationship (18=self)', 'Group number', 'Group name', 'Insurance type', '', '', '', 'Claim filing indicator (CI=commercial, MB=Medicare B, MC=Medicaid, BL=BCBS)'] },
  PAT: { name: 'Patient information', elements: ['Relationship to insured (01=spouse, 19=child, 20=employee, G8=other)'] },
  DMG: { name: 'Demographics', elements: ['Format (D8=CCYYMMDD)', 'Date of birth', 'Gender (F/M/U)'] },
  CLM: { name: 'Claim information', elements: ['Patient control number', 'Total claim charge', '', '', 'Place of service : qualifier : frequency (1=original, 7=replacement, 8=void)', 'Provider signature on file', 'Assignment / plan participation', 'Benefits assigned', 'Release of information', 'Patient signature source'] },
  HI: { name: 'Health care diagnosis codes', elements: ['Diagnosis 1 (ABK=principal ICD-10-CM)', 'Diagnosis 2 (ABF=other ICD-10-CM)', 'Diagnosis 3', 'Diagnosis 4', 'Diagnosis 5', 'Diagnosis 6', 'Diagnosis 7', 'Diagnosis 8', 'Diagnosis 9', 'Diagnosis 10', 'Diagnosis 11', 'Diagnosis 12'] },
  LX: { name: 'Line / header number', elements: ['Sequence number'] },
  SV1: { name: 'Professional service', elements: ['Procedure (HC:code:modifier…)', 'Line charge', 'Unit basis (UN=unit, MJ=minutes)', 'Units', 'Place of service', '', 'Diagnosis pointers (1–4)'] },
  DTP: { name: 'Date or time period', elements: ['Qualifier (472=service date, 431=onset, 454=initial treatment)', 'Format (D8 / RD8)', 'Date'] },
  BPR: { name: 'Financial information (payment)', elements: ['Transaction handling (I=remittance + payment, H=notification only)', 'Total payment amount', 'Credit / debit (C)', 'Payment method (ACH, CHK=check, NON=no payment)', 'Payment format (CCP, CTX)', 'Sender DFI qualifier', 'Sender bank ID', 'Account qualifier', 'Sender account', 'Originating company ID', 'Supplemental code', 'Receiver DFI qualifier', 'Receiver bank ID', 'Account qualifier', 'Receiver account', 'Payment / effective date'] },
  TRN: { name: 'Reassociation trace number', elements: ['Trace type (1=current)', 'Check or EFT trace number', 'Payer ID', 'Supplemental ID'] },
  DTM: { name: 'Date / time reference', elements: ['Qualifier (405=production date, 050=received, 232/233=claim period, 472=service date, 036=coverage expired)', 'Date'] },
  CLP: { name: 'Claim payment information', elements: ['Patient control number (from CLM01)', 'Claim status (1=processed as primary, 2=secondary, 3=tertiary, 4=denied, 19/20/21=as primary/secondary/tertiary, forwarded, 22=reversal)', 'Total claim charge', 'Claim payment amount', 'Patient responsibility', 'Claim filing indicator', 'Payer claim control number', 'Facility type', 'Claim frequency'] },
  CAS: { name: 'Claim / service adjustment', elements: ['Group code (CO=contractual, PR=patient responsibility, OA=other, PI=payer initiated)', 'Reason code (CARC)', 'Amount', 'Quantity', 'Reason code', 'Amount', 'Quantity', 'Reason code', 'Amount', 'Quantity', 'Reason code', 'Amount', 'Quantity', 'Reason code', 'Amount', 'Quantity', 'Reason code', 'Amount', 'Quantity'] },
  SVC: { name: 'Service payment information', elements: ['Adjudicated procedure (HC:code:modifier…)', 'Line charge', 'Line payment', 'Revenue code', 'Units paid', 'Submitted procedure (if different)', 'Original units'] },
  AMT: { name: 'Monetary amount', elements: ['Qualifier (B6=allowed, AU=coverage, D8=discount, F5=patient paid)', 'Amount'] },
  QTY: { name: 'Quantity', elements: ['Qualifier', 'Quantity'] },
  LQ: { name: 'Remark code', elements: ['Code list (HE=RARC)', 'Remark code'] },
  MOA: { name: 'Outpatient adjudication information', elements: ['Reimbursement rate', 'HCPCS payable amount', 'Remark code', 'Remark code', 'Remark code', 'Remark code', 'Remark code'] },
  PLB: { name: 'Provider-level adjustment', elements: ['Provider ID', 'Fiscal period end', 'Reason : reference (WO=overpayment recovery, L6=interest, FB=forwarding balance)', 'Amount', 'Reason : reference', 'Amount'] },
  CUR: { name: 'Currency', elements: ['Entity', 'Currency code'] },
}

export const GROUP_CODES: Record<string, { name: string; who: string }> = {
  CO: { name: 'Contractual obligation', who: 'Provider writes this off — it cannot be billed to the patient.' },
  PR: { name: 'Patient responsibility', who: 'The patient owes this (deductible, coinsurance, copay or a non-covered service the patient agreed to).' },
  OA: { name: 'Other adjustment', who: 'Neither of the above — often coordination of benefits or a prior payment.' },
  PI: { name: 'Payer-initiated reduction', who: 'The payer reduced payment without a contract basis; it cannot be billed to the patient but may be appealed.' },
  CR: { name: 'Correction and reversal', who: 'Not used in 5010 and later.' },
}

export const CLAIM_STATUS: Record<string, string> = {
  '1': 'Processed as primary',
  '2': 'Processed as secondary',
  '3': 'Processed as tertiary',
  '4': 'Denied',
  '19': 'Processed as primary, forwarded to another payer',
  '20': 'Processed as secondary, forwarded to another payer',
  '21': 'Processed as tertiary, forwarded to another payer',
  '22': 'Reversal of previous payment',
  '23': 'Not our claim, forwarded to another payer',
  '25': 'Predetermination pricing only — no payment',
}

export const PLACE_OF_SERVICE: Record<string, string> = {
  '02': 'Telehealth (other than home)',
  '10': 'Telehealth in patient’s home',
  '11': 'Office',
  '12': 'Home',
  '19': 'Off-campus outpatient hospital',
  '20': 'Urgent care',
  '21': 'Inpatient hospital',
  '22': 'On-campus outpatient hospital',
  '23': 'Emergency room',
  '31': 'Skilled nursing facility',
  '81': 'Independent laboratory',
}
