from flask import Flask, render_template, request

import config
import os
import json
import ee
import time
import calendar
import datetime
import threading

import logging, logging.config, yaml

from pymemcache.client.hash import Client
#from google.appengine.api import memcache as mc

##################################################################################################
# CONSTANT DEFINITIONS
##################################################################################################

EE_CREDENTIALS = ee.ServiceAccountCredentials(config.EE_ACCOUNT, config.EE_PRIVATE_KEY_FILE)

HIGH_COLLECTION_ID = 'srtm90_v4'
LIGHTS_COLLECTION_ID = 'NOAA/DMSP-OLS/NIGHTTIME_LIGHTS'
TEMPERATURE_COLLECTION_ID = 'MODIS/MOD11A2'

REDUCTION_SCALE_METERS = 20000

COUNTRIES_FILE = 'static/countries.txt'
COUNTRIES_PATH = 'static/countries/'
DETAILS_PATH = 'static/details/'

CACHE = 0 # When use memcache
SAVE = 0 # When we save data to precompute it in details folder
INITIAL_MAP = '5'

#logging
#LOGGER_TYPE = 'file'
LOGGER_TYPE = 'console'
logging.config.dictConfig(yaml.load(open('logging.conf')))
logger = logging.getLogger(LOGGER_TYPE)

##################################################################################################
# FUNCTIONS 
##################################################################################################
def json_serializer(key, value):
  if type(value) == str:
     return value, 1
  return json.dumps(value), 2

def json_deserializer(key, value, flags):
  if flags == 1:
      return value
  if flags == 2:
      return json.loads(value)
  raise Exception('Unknown serialization format')

mc = Client(('localhost', 11211), serializer = json_serializer, deserializer = json_deserializer)

def createCountries(filename):
  file  = open(filename, 'r')
  return  file.read().splitlines()

COUNTRIES_ID = createCountries(COUNTRIES_FILE)


def change_dict(dct):
  if 'features' in dct:
    return dct['features'][0]
  return dct

# Add a band containing image date as years since 1991.
def CreateTimeBand(img):
  year = ee.Date(img.get('system:time_start')).get('year').subtract(1991)
  return ee.Image(year).byte().addBands(img)

def CreateTimeBandTemp(img):
  year = ee.Date(img.get('system:time_start')).get('year').subtract(2013)
  return ee.Image(year).byte().addBands(img)


def GetFeature(country_id):
  """Returns an ee.Feature for the country with the given ID."""
  if CACHE:
    try:
      geojson = mc.get('geojson_' + country_id)
      if geojson is not None:
        return ee.Feature(geojson)
    except Exception as e:
      logger.debug('Error GetFeature cache: '  + str(e))

  # Note: The country IDs are read from the filesystem in the initialization
  path = COUNTRIES_PATH + country_id + '.geo.json'
  path = os.path.join(os.path.split(__file__)[0], path)
  try:
    with open(path, 'r') as f:
      t = f.read()
      elem = json.loads(t, object_hook = change_dict)
      if CACHE:
        mc.set('geojson_' + country_id, elem)
      f.close()
      return ee.Feature(elem)
  except Exception as e:
    logger.debug('Error GetFeature reading file ' + path)

def coordsToFeature(coords):
  feature = json.loads(coords, object_hook = change_dict)
  return ee.Feature(feature)
  
def GetMapFromId(id):
  if id == '0':
    return GetHighMap()
  elif id == '1':
    return GetLightsMap()
  elif id == '2':
    return GetTemperatureMap()
  elif id == '3':
    return GetWaterOccurrenceMap()
  elif id == '4':
    return GetWaterChangeMap()
  elif id == '5':
    return GetForestChangeMap()
  elif id == '6':
    return GetVegetationMap()
  else:
    raise Exception("Map does not exists")


##################################################################################################
# HIGH MAP 
##################################################################################################

def GetHighMap():
  return ee.Image(HIGH_COLLECTION_ID).getMapId({
    'min': '0',
    'max': '1000',
    'palette': '0000ff, 008000, ff0000'
  })

def ComputeCountryTimeSeriesHigh(country_id, feature = None, zoom = 1):
  """Returns mean elevation for the country."""
  img = ee.Image(HIGH_COLLECTION_ID)
  img = img.select('elevation')

  scale = 50000
  if feature is None:
    feature = GetFeature(country_id)
  else:
    scale = scale / zoom
  
  reduction = img.reduceRegion(ee.Reducer.mean(), feature.geometry(), scale)
  
  feature = ee.Feature(None, {
    'elevation': reduction.get('elevation')
  })
  chart_data = feature.getInfo()

  return chart_data['properties']


##################################################################################################
# LIGHTS MAP 
##################################################################################################

def GetLightsMap():
  """Returns the MapID for the night-time lights trend map."""
  collection = ee.ImageCollection(LIGHTS_COLLECTION_ID)

  collection = collection.select('stable_lights').map(CreateTimeBand)
  # Fit a linear trend to the nighttime lights collection.
  fit = collection.reduce(ee.Reducer.linearFit())

  return fit.getMapId({
      'min': '0',
      'max': '0.18,20,-0.18',
      'bands': 'scale,offset,scale',
  })

def ComputeCountryTimeSeriesLights(country_id, feature = None, zoom = 1):
  """Returns a series of brightness over time for the country."""
  collection = ee.ImageCollection(LIGHTS_COLLECTION_ID)
  collection = collection.select('stable_lights').sort('system:time_start')
  
  scale = REDUCTION_SCALE_METERS
  if feature is None:
    feature = GetFeature(country_id)
  else:
    scale = scale / zoom

  # Compute the mean brightness in the region in each image.
  def ComputeMeanLights(img):
    reduction = img.reduceRegion(ee.Reducer.mean(), feature.geometry(), scale)
    return ee.Feature(None, {
        'stable_lights': reduction.get('stable_lights'),
        'system:time_start': img.get('system:time_start')
    })

  chart_data = collection.map(ComputeMeanLights).getInfo()

  # Extract the results as a list of lists.
  def ExtractMeanLights(feature):
    if 'stable_lights' in feature['properties'] and feature['properties']['stable_lights'] is not None:
      return [
          feature['properties']['system:time_start'],
          feature['properties']['stable_lights']
      ]
  
  return map(ExtractMeanLights, chart_data['features'])


##################################################################################################
# TEMPERATURE MAP 
##################################################################################################

def GetTemperatureMap():
  """Returns the MapID for the temperature map"""
  collection = ee.ImageCollection(TEMPERATURE_COLLECTION_ID)
  collection = collection.select('LST_Day_1km')#.map(CreateTimeBand)

  fit = collection.median().toFloat().multiply(ee.Image(0.02)).subtract(ee.Image(273.15))

  return fit.getMapId({
    'min': '0',
    'max': '40',
    'palette':'0000ff,32cd32,ffff00,ff8c00,ff0000'
  })
  
def ComputeCountryTimeSeriesTemp(country_id, feature = None, zoom = 1):
  """Returns a series of surface temperature over time for the country."""
  collection = ee.ImageCollection(TEMPERATURE_COLLECTION_ID)
  collection = collection.select('LST_Day_1km')

  scale = 30000
  if feature is None:
    feature = GetFeature(country_id)
  else:
    scale = scale / zoom
  # Compute the mean temperature in the region in each image.
  def ComputeMeanTemp(img):
    reduction = img.reduceRegion(ee.Reducer.mean(),feature.geometry(), scale)
    return ee.Feature(None, {
        'temperature': reduction.get('LST_Day_1km'),
        'system:time_start': img.get('system:time_start')
    })

  chart_data = collection.map(ComputeMeanTemp).getInfo()

  def toCelsius(kelvin):
    scale = 0.02
    return kelvin * scale - 273.15

  # Extract the results as a list of lists.
  def ExtractMeanTemp(feature):
    if 'temperature' in feature['properties'] and feature['properties']['temperature'] is not None:
      tempInCelsius = toCelsius(feature['properties']['temperature'])
      return [
        feature['properties']['system:time_start'],
        tempInCelsius
      ]

  return map(ExtractMeanTemp, chart_data['features'])

##################################################################################################
# WATER OCCURRENCE MAP
##################################################################################################

def GetWaterOccurrenceMap():
  img = ee.Image('JRC/GSW1_0/GlobalSurfaceWater')
  img = img.select('occurrence')
  return img.getMapId({
    'min': '0',
    'max': '100',
    'palette': 'ff0000,0000ff'
  })


def ComputeCountryTimeSeriesWaterOccurence(country_id, feature = None, zoom = 1):
  """Returns a series of water occurrence over time for the country."""
  image = ee.Image('JRC/GSW1_0/GlobalSurfaceWater')
  image = image.select('change_abs')

  scale = REDUCTION_SCALE_METERS
  if feature is None:
    feature = GetFeature(country_id)
  else:
    scale = scale / zoom 

  # Compute the mean temperature in the region in each image.
  def ComputeMeanWaterOccurence(img):
    reduction = img.reduceRegion(ee.Reducer.histogram(), feature.geometry(), scale)
    
    return ee.Feature(None, {
        'system:time_start' : img.get('system:time_start'),
        'water': reduction.get('change_abs')
    })

  chart_data = ComputeMeanWaterOccurence(image).getInfo()
  
  return chart_data['properties']['water']


##################################################################################################
# WATER CHANGE MAP 
##################################################################################################

def GetWaterChangeMap():
  img = ee.Image('JRC/GSW1_0/GlobalSurfaceWater')
  img = img.select('change_abs')
  return img.getMapId({
    'min': '-50',
    'max': '50',
    'palette': 'ff0000,000000,00ff00'
  })
def ComputeCountryTimeSeriesWaterChange(country_id, feature = None, zoom = 1):
  """Returns a series of water change over time for the country."""
  collection = ee.ImageCollection('JRC/GSW1_0/YearlyHistory')
  collection = collection.select('waterClass')
 
  scale = REDUCTION_SCALE_METERS
  if feature is None:
    feature = GetFeature(country_id)
  else:
    scale = scale / zoom
  # Compute the mean temperature in the region in each image.
  def ComputeMeanWaterChange(img):
    reduction = img.reduceRegion(ee.Reducer.mean(), feature.geometry(), scale)

    return ee.Feature(None, {
        'system:time_start' : img.get('system:time_start'),
        'water': reduction.get('waterClass')
    })

  chart_data = collection.map(ComputeMeanWaterChange).getInfo()

  # Extract the results as a list of lists.
  def ExtractMeanWaterChange(feature):
    if 'water' in feature['properties'] and feature['properties']['water'] is not None:
      return [
        feature['properties']['system:time_start'],
        feature['properties']['water']
      ]

  return map(ExtractMeanWaterChange, chart_data['features'])


##################################################################################################
# FOREST CHANGE MAP
##################################################################################################

def GetForestChangeMap():
  img = ee.Image('UMD/hansen/global_forest_change_2015')
  return img.getMapId({
    'bands': 'loss, treecover2000, gain',
    'max': '1, 255, 1'
  })

def ComputeCountryTimeSeriesForestChange(country_id, feature = None, zoom = 1):
  """Returns country forest change."""
  collection = ee.Image('UMD/hansen/global_forest_change_2015')
  
  scale = 14000
  if feature is None:
    feature = GetFeature(country_id)
  else:
    scale = scale / zoom
  # Compute the mean temperature in the region in each image.
  def ComputeMeanForestChange(img):
    reduction = img.reduceRegion(ee.Reducer.mean(), feature.geometry(), scale)

    return ee.Feature(None, {
        'treecover2000' : reduction.get('treecover2000'),
        'loss': reduction.get('loss'),
        'gain': reduction.get('gain')
    })

  chart_data = ComputeMeanForestChange(collection).getInfo()

  # Extract the results as a list of lists.
  def ExtractMeanForestChange(feature):
    if 'loss' in feature['properties'] and feature['properties']['loss'] is not None:
      return [
        feature['properties']['treecover2000'],
        feature['properties']['gain'],
        feature['properties']['loss']
      ]

  return ExtractMeanForestChange(chart_data)


##################################################################################################
# VEGETATION INDEX MAP 
##################################################################################################

def GetVegetationMap():
  img = ee.Image(ee.ImageCollection('MODIS/MCD43A4_NDVI').mean())
  return img.getMapId({
    'min': '0',
    'max': '1',
    'palette' : 'FFFFFF,CC9966,CC9900,996600,33CC00,009900,006600,000000'
  })

def ComputeCountryTimeSeriesVegetation(country_id, feature = None, zoom = 1):
  """Returns a series of vegetation over time for the country."""
  collection = ee.ImageCollection('MODIS/MCD43A4_NDVI')
  collection = collection.select('NDVI')
  
  scale = REDUCTION_SCALE_METERS
  if feature is None:
    feature = GetFeature(country_id)
  else:
    scale = scale / zoom

  # Compute the mean temperature in the region in each image.
  def ComputeMeanVegetation(img):
    reduction = img.reduceRegion(ee.Reducer.mean(), feature.geometry(), scale)

    return ee.Feature(None, {
        'system:time_start' : img.get('system:time_start'),
        'NDVI': reduction.get('NDVI')
    })

  chart_data = collection.map(ComputeMeanVegetation).getInfo()

  # Extract the results as a list of lists.
  def ExtractMeanVegetation(feature):
    if 'NDVI' in feature['properties'] and feature['properties']['NDVI'] is not None:
      return [
        feature['properties']['system:time_start'],
        feature['properties']['NDVI']
      ]

  return map(ExtractMeanVegetation, chart_data['features'])


def ComputeCountryTimeSeries(map_id, country_id, feature = None, zoom = 1):
  """Returns a series of the specific map over time for the country."""
  if map_id == '0':
    return ComputeCountryTimeSeriesHigh(country_id, feature, zoom)
  elif map_id == '1':
    return ComputeCountryTimeSeriesLights(country_id, feature, zoom)
  elif map_id == '2':
    return ComputeCountryTimeSeriesTemp(country_id, feature, zoom)
  elif map_id == '3':
    return ComputeCountryTimeSeriesWaterOccurence(country_id, feature, zoom)
  elif map_id == '4':
    return ComputeCountryTimeSeriesWaterChange(country_id, feature, zoom)
  elif map_id == '5':
    return ComputeCountryTimeSeriesForestChange(country_id, feature, zoom)
  elif map_id == '6':
    return ComputeCountryTimeSeriesVegetation(country_id, feature, zoom)
  else:
    raise Exception("Map type does not exists")

##################################################################################################
# APP ROUTES
##################################################################################################

# API
app = Flask(__name__)

app.jinja_env.auto_reload = True
app.config.update(
  DEBUG=False,
  TEMPLATES_AUTO_RELOAD=False
)

@app.before_request
def before_request():
  # When you import jinja2 macros, they get cached which is annoying for local
  # development, so wipe the cache every request.
  #app.jinja_env.cache = dict()
  # Initialize Earth Engine
  ee.Initialize(EE_CREDENTIALS)
  #ee.Initialize()

# Define root route
@app.route('/')
def main():
  mapid = GetMapFromId(INITIAL_MAP)
  
  # Add variables to the template
  template_values = {
    'map': INITIAL_MAP,
    'mapid': mapid['mapid'],
    'token': mapid['token'],
    'API_KEY': config.API_KEY,
    'countries' : json.dumps(COUNTRIES_ID)
  }

  # Render the template index.html
  return render_template('index.html', values = template_values)


@app.route('/map/<id>')
def get(id):
  mapid = GetMapFromId(id)
  # Add variables to the template
  template_values = {
    'map' : id,
    'mapid': mapid['mapid'],
    'token': mapid['token'],
    'API_KEY': config.API_KEY,
    'countries' : json.dumps(COUNTRIES_ID)
  }
  # Render the template reload.html
  return render_template('reload.html', values = template_values)


@app.route('/save/<map_id>')
def saveCountryTimeSeries(map_id):
  error = 0
  message = ''
  if CACHE:
    elems = dict()
    if SAVE:
      path = DETAILS_PATH + 'mapid_' + map_id + '.json'
      details_file = open(path, 'w')
    else:
      thread = threading.Thread()
      thread.start()
    for country_id in COUNTRIES_ID:  
      key = 'details' + '_'+ map_id + '_' + country_id
      details = dict()
      try:
        if map_id == '0' or map_id == '3':
          details = ComputeCountryTimeSeries(map_id, country_id)
          if details is not None:
            mc.set(key, json.dumps(details))
        elif map_id == '5':
          details['forestChange'] = ComputeCountryTimeSeries(map_id, country_id)
          if details['forestChange'] is not None:
            mc.set(key, json.dumps(details))
        else:
          details['timeSeries'] = list(ComputeCountryTimeSeries(map_id, country_id))
          if details['timeSeries'] is not None:
            mc.set(key, json.dumps(details))
        elems[country_id] = details
      except Exception as e:
        error = 1
        message = str(e)
        logger.debug('Error saveCountryTimeSeries: ' + message)
    if SAVE and not error:
      json.dump(elems, details_file , separators = (',', ':'))
      details_file.close()
  return json.dumps({'status' : error, 'message' : message})

@app.route('/static/<map_id>')
def staticCountryTimeSeries(map_id):
  error = 0
  message = ''
  if SAVE:
    elems = dict()
    path = DETAILS_PATH + 'mapid_' + map_id + '.json'
    details_file = open(path, 'w')
    for country_id in COUNTRIES_ID:  
      key = 'details' + '_'+ map_id + '_' + country_id
      details = dict()
      try:
        if map_id == '0' or map_id == '3':
          details = ComputeCountryTimeSeries(map_id, country_id)
          if details is not None:
            elems[country_id] = details
        elif map_id == '5':
          details['forestChange'] = ComputeCountryTimeSeries(map_id, country_id)
          if details['forestChange'] is not None:
            elems[country_id] = details
        else:
          details['timeSeries'] = list(ComputeCountryTimeSeries(map_id, country_id))
          if details['timeSeries'] is not None:
            elems[country_id] = details
      except Exception as e:
        error = 1
        message = str(e)
        logger.debug('Error saveCountryTimeSeries: ' + message)
    if not error:
      json.dump(elems, details_file , separators = (',', ':'))
      details_file.close()
  return json.dumps({'status' : error, 'message' : message})

@app.route('/details/<map_id>/<country_id>')
def GetCountryTimeSeries(map_id, country_id):
  if CACHE:
    try:
      key = 'details' + '_'+ map_id + '_' + country_id
      details = mc.get(key)
      if details is not None:
        return details
    except Exception as e:
      logger.debug('Error cache GetCountryTimeSeries: ' + str(e))

  details = dict()
  try:
    if map_id == '0' or map_id == '3':
      details = ComputeCountryTimeSeries(map_id, country_id)
      if CACHE and details is not None:
        mc.set(key, json.dumps(details))
    elif map_id == '5':
      details['forestChange'] = ComputeCountryTimeSeries(map_id, country_id)
      if CACHE and details['forestChange'] is not None:
        mc.set(key, json.dumps(details))
    else:
      details['timeSeries'] = list(ComputeCountryTimeSeries(map_id, country_id))
      if CACHE and details['timeSeries'] is not None:
        mc.set(key, json.dumps(details))

  except ee.EEException as e:
    # Handle exceptions from the EE client library.
    details['error'] = str(e)
    logger.debug('Error GetCountryTimeSeries: ' + details['error'])
  # Send the results to the browser.
  return json.dumps(details)

@app.route('/details/<map_id>')
def GetAllCountriesDetails(map_id):
  if CACHE:
    try:
     key = 'details' + '_' + map_id
     countries = mc.get(key)
     if countries is not None:
       return countries
    except Exception as e:
      logger.debug('Error cache GetAllCountriesDetails' + str(e))
    countries = list()
    for country_id in COUNTRIES_ID: 
      try: 
        key = 'details' + '_'+ map_id + '_' + country_id
        country = mc.get(key)
      except Exception as e:
        logger.debug('Error cache GetAllCountriesDetails: ' + country_id)
      try:
        if country is None:
          elem = {'name' : getCountryName(country_id), 'data' : ComputeCountryTimeSeries(map_id, country_id) }
        else:
          elem = {'name' : getCountryName(country_id), 'data' : country }
        countries.append(json.dumps(elem))
      except Exception as e:
        logger.debug('Error GetAllCountriesDetails, country: ' + country_id + ' : ' + str(e))
    key = 'details' + '_'+ map_id
    mc.set(key, json.dumps(countries))
  else:
    countries = dict()
    countries['error'] = 'Not implemented yet'
  return json.dumps(countries)


@app.route('/custom/<map_id>/<zoom>', methods = ['POST'])
def GetCustomSeries(map_id, zoom):
  """Get time series from a custom polygon"""
  key = list(request.form.keys())[0]
  details = dict()
  try:
    feature = coordsToFeature(key)
    if feature is not None:
      try:
        zoom = int(zoom)
        if map_id == '0' or map_id == '3':
          details = ComputeCountryTimeSeries(map_id, None, feature, zoom)
        elif map_id == '5':
          details['forestChange'] = ComputeCountryTimeSeries(map_id, None, feature, zoom)
        else:
          details['timeSeries'] = list(ComputeCountryTimeSeries(map_id, None, feature, zoom))
      except ee.EEException as e:
        # Handle exceptions from the EE client library.
        details['error'] = str(e)
        logger.debug('Error GetCustomSeries: ' + details['error'])
  except Exception as e:
    details['error'] = str(e)
    logger.debug('Error GetCustomSeries: ' + details['error'])
  # Send the results to the browser.
  return json.dumps(details)

@app.route('/country/<country_id>')
def getCountryName(country_id):
  """Get country name from country id"""
  if CACHE:
    try:
      key = 'name_' + country_id
      name = mc.get(key)
      if name is not None:
        return name
    except Exception as e:
      logger.debug('Error cache getCountryName:' + str(e))
  path = COUNTRIES_PATH + country_id + '.geo.json'
  path = os.path.join(os.path.split(__file__)[0], path)
  try:
    with open(path, 'r') as f:
      t = f.read()
      elem = json.loads(t, object_hook = change_dict)
      name = elem['properties']['name']
      if CACHE and name is not None:
        mc.set(key, name)
      f.close()
      return name
  except Exception as e:
    logger.debug('Error getCountryName reading file ' + path + ' : ' + str(e))

# Run application in selected port
if __name__ == '__main__':
  app.run('0.0.0.0', 8080, threaded=True)