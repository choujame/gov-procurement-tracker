export interface PccBriefRecord {
  type: string;
  title: string;
}

export interface PccSearchRecord {
  unit_id: string;
  unit_name: string;
  job_number: string;
  brief: PccBriefRecord;
  date: string;
  filename: string;
}

export interface PccSearchResponse {
  total: number;
  hits: number;
  records: PccSearchRecord[];
  query?: string;
}

export interface PccVendorAward {
  unit_name: string;
  job_number: string;
  brief: PccBriefRecord;
  date: string;
  filename: string;
}

export interface PccVendorResponse {
  vendor_name: string;
  vendor_key: string;
  records: PccVendorAward[];
}

export interface PccUnitRecord {
  job_number: string;
  brief: PccBriefRecord;
  date: string;
  filename: string;
}

export interface PccUnitResponse {
  unit_name: string;
  unit_id: string;
  records: PccUnitRecord[];
}

export interface PccTenderDetail {
  unit_id: string;
  job_number: string;
  detail: Record<string, unknown>;
}
