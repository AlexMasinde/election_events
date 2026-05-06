import { env } from '../config/env';
import logger from '../config/logger';

interface VoterLookupFilters {
  county?: string;
  constituency?: string;
  ward?: string;
  pollingCenter?: string;
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

interface AdultPopulation {
  id_number: string;
  full_name: string;
  date_of_birth: string;
  sex: string;
}

interface VoterLookupResponse {
  message: {
    registered_voters: RegisteredVoter | null;
    adult_population: AdultPopulation | null;
    id_number: string;
    filters_applied?: VoterLookupFilters;
  };
}

// Define possible statuses
export enum RegistrationStatus {
  VALID_JURISDICTION = 'VALID_JURISDICTION',
  REGISTERED_OUTSIDE_JURISDICTION = 'REGISTERED_OUTSIDE_JURISDICTION',
  VALID_NATIONAL = 'VALID_NATIONAL',
  NOT_REGISTERED = 'NOT_REGISTERED',
  NOT_FOUND = 'NOT_FOUND'
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
  registrationStatus: RegistrationStatus;
}

export const lookupVoter = async (
  idNumber: string,
  filters: VoterLookupFilters
): Promise<FormattedVoterInfo | null> => {
  try {
    const apiUrl = env.VOTER_LOOKUP_API_URL;
    const apiToken = env.VOTER_LOOKUP_API_TOKEN;

    // Helper to perform the API call
    const performLookup = async (lookupFilters: VoterLookupFilters) => {
      const filtersToSend: Record<string, string> = {};
      if (lookupFilters.county) filtersToSend.county = lookupFilters.county;
      if (lookupFilters.constituency) filtersToSend.constituency = lookupFilters.constituency;
      if (lookupFilters.ward) filtersToSend.ward = lookupFilters.ward;
      if (lookupFilters.pollingCenter) filtersToSend.polling_center = lookupFilters.pollingCenter;

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

      return (await response.json()) as VoterLookupResponse;
    };

    const hasFilters = !!(
      filters.county ||
      filters.constituency ||
      filters.ward ||
      filters.pollingCenter
    );

    // 1. Initial Search (with filters if provided)
    const data = await performLookup(filters);
    const registeredVoters = data.message.registered_voters;
    // We only care about adult population from the *fallback* search mostly, unless it's a national event.
    let adultPopulation = data.message.adult_population;

    if (registeredVoters) {
        // FOUND IN REGISTER during initial search
        // Concatenate name
        const nameParts: string[] = [];
        if (registeredVoters.first_name) nameParts.push(registeredVoters.first_name);
        if (registeredVoters.middle_name) nameParts.push(registeredVoters.middle_name);
        if (registeredVoters.surname) nameParts.push(registeredVoters.surname);
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
          registrationStatus: hasFilters ? RegistrationStatus.VALID_JURISDICTION : RegistrationStatus.VALID_NATIONAL
        };
    } 
    
    // NOT FOUND IN REGISTER (in initial search)

    if (hasFilters) {
        // It was a filtered event, and we didn't find them in the jurisdiction.
        // Step 2: Expand scope - Search everywhere (no filters)
        const fallbackData = await performLookup({});
        const fallbackRegistered = fallbackData.message.registered_voters;
        const fallbackAdult = fallbackData.message.adult_population;

        if (fallbackRegistered) {
             // Found in register, but implied it was outside jurisdiction (since first search failed)
             // ...Wait, technically if the API is perfect, yes.
             const nameParts: string[] = [];
             if (fallbackRegistered.first_name) nameParts.push(fallbackRegistered.first_name);
             if (fallbackRegistered.middle_name) nameParts.push(fallbackRegistered.middle_name);
             if (fallbackRegistered.surname) nameParts.push(fallbackRegistered.surname);
             const fullName = nameParts.join(' ').trim();

             return {
                idNumber: fallbackRegistered.id_or_passport_number,
                name: fullName,
                dateOfBirth: fallbackRegistered.date_of_birth,
                sex: fallbackRegistered.sex,
                county: fallbackRegistered.county,
                constituency: fallbackRegistered.constituency,
                ward: fallbackRegistered.ward,
                pollingCenter: fallbackRegistered.polling_center,
                registrationStatus: RegistrationStatus.REGISTERED_OUTSIDE_JURISDICTION
             };
        } else if (fallbackAdult) {
            // Found in Adult Pop only
            return {
                idNumber: fallbackAdult.id_number,
                name: fallbackAdult.full_name,
                dateOfBirth: fallbackAdult.date_of_birth,
                sex: fallbackAdult.sex,
                county: '',
                constituency: '',
                ward: '',
                pollingCenter: 'Adult Population Registry',
                registrationStatus: RegistrationStatus.NOT_REGISTERED
            };
        }
        
        // Not found anywhere
        return null;

    } else {
        // National Event (No filters) - We already have the result from Step 1 (which was global)
        if (adultPopulation) {
             return {
                idNumber: adultPopulation.id_number,
                name: adultPopulation.full_name,
                dateOfBirth: adultPopulation.date_of_birth,
                sex: adultPopulation.sex,
                county: '',
                constituency: '',
                ward: '',
                pollingCenter: 'Adult Population Registry',
                registrationStatus: RegistrationStatus.NOT_REGISTERED // Even for national, we flag as not registered
            };
        }
    }

    return null;
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

