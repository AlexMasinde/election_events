import { env } from '../config/env';
import logger from '../config/logger';

interface VoterLookupFilters {
  county?: string;
  constituency?: string;
  ward?: string;
}

interface RegisteredVoter {
  id_or_passport_number: string;
  first_name: string | null;
  middle_name: string | null;
  surname: string | null;
  date_of_birth: string;
  sex: string;
  county: string;
  constituency: string;
  ward: string;
  polling_center: string;
  stream?: string;
}

interface VoterLookupResponse {
  message: {
    registered_voters: RegisteredVoter | null;
    id_number: string;
    filters_applied?: VoterLookupFilters;
  };
}

export interface FormattedVoterInfo {
  idNumber: string;
  name: string;
  dateOfBirth: string;
  sex: string;
  county: string;
  constituency: string;
  ward: string;
  pollingCenter: string;
}

export const lookupVoter = async (
  idNumber: string,
  filters: VoterLookupFilters
): Promise<FormattedVoterInfo | null> => {
  try {
    const apiUrl = env.VOTER_LOOKUP_API_URL;
    const apiToken = env.VOTER_LOOKUP_API_TOKEN;

    // Build filters object - only include non-empty values
    const filtersToSend: VoterLookupFilters = {};
    if (filters.county) {
      filtersToSend.county = filters.county;
    }
    if (filters.constituency) {
      filtersToSend.constituency = filters.constituency;
    }
    if (filters.ward) {
      filtersToSend.ward = filters.ward;
    }

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `token ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id_number: idNumber,
        filters: Object.keys(filtersToSend).length > 0 ? filtersToSend : undefined,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = (await response.json()) as VoterLookupResponse;
    const registeredVoters = data.message.registered_voters;

    if (!registeredVoters) {
      return null;
    }

    // Concatenate name fields, handling null values
    const nameParts: string[] = [];
    if (registeredVoters.first_name) {
      nameParts.push(registeredVoters.first_name);
    }
    if (registeredVoters.middle_name) {
      nameParts.push(registeredVoters.middle_name);
    }
    if (registeredVoters.surname) {
      nameParts.push(registeredVoters.surname);
    }
    const fullName = nameParts.join(' ').trim();

    return {
      idNumber: registeredVoters.id_or_passport_number,
      name: fullName,
      dateOfBirth: registeredVoters.date_of_birth,
      sex: registeredVoters.sex,
      county: registeredVoters.county,
      constituency: registeredVoters.constituency,
      ward: registeredVoters.ward,
      pollingCenter: registeredVoters.polling_center,
    };
  } catch (error) {
    logger.error('Error looking up voter:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      idNumber,
      filters,
    });
    throw error;
  }
};

