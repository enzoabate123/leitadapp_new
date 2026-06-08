export async function geocodeAddress(address) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'CommuteQuestDashboard/1.0'
      }
    });
    if (!res.ok) throw new Error('Geocoding failed');
    const data = await res.json();
    if (data && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lon: parseFloat(data[0].lon)
      };
    }
  } catch (err) {
    console.error('Geocoding error:', err);
  }
  return null;
}

export async function fetchOSRMRoute(coordsList, includeSteps = true) {
  try {
    const formattedPoints = coordsList.map(pt => `${pt[1]},${pt[0]}`).join(';');
    const url = `https://router.project-osrm.org/route/v1/driving/${formattedPoints}?overview=full&geometries=geojson&steps=${includeSteps}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('OSRM request failed');
    const data = await res.json();
    if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
      const route = data.routes[0];
      const routeCoords = route.geometry.coordinates.map(coord => [coord[1], coord[0]]);
      const etaMinutes = Math.round(route.duration / 60);
      const routeDistanceKm = Number((route.distance / 1000).toFixed(2));
      
      const steps = [];
      if (includeSteps && route.legs && route.legs.length > 0) {
        for (const leg of route.legs) {
          if (leg.steps) {
            for (const step of leg.steps) {
              steps.push({
                name: step.name || '',
                distanceKm: step.distance / 1000
              });
            }
          }
        }
      }
      
      return {
        routeCoords,
        etaMinutes,
        routeDistanceKm,
        routeSteps: steps
      };
    }
  } catch (err) {
    console.error('OSRM Routing error:', err);
  }
  return null;
}
