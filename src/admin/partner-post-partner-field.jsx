import React from 'react';
import { CleanPropertyComponent, useCurrentAdmin } from 'adminjs';

/**
 * Staff pick a partner from the directory.
 * A partner login already belongs to one partner, so the field is not shown.
 */
const PartnerPostPartnerField = (props) => {
  const [currentAdmin] = useCurrentAdmin();
  if (currentAdmin?.role === 'PARTNER') return null;
  return <CleanPropertyComponent {...props} />;
};

export default PartnerPostPartnerField;
