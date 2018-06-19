import unittest
from selenium import webdriver
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from urllib2 import Request, urlopen
from json import loads

URL = 'http://localhost:8080'
DELAY = 200
COUNTRY_ID = 'ESP'

class TestCase(unittest.TestCase):

    def setUp(self):
        chrome_options = webdriver.ChromeOptions()
        chrome_options.add_argument('--headless')
        chrome_options.add_argument('--no-sandbox') # required when running as root user. otherwise you would get no sandbox errors. 
        self.browser = webdriver.Chrome('/var/www/files/chromedriver', chrome_options=chrome_options, service_args=['--verbose', '--log-path=/tmp/chromedriver.log'])
        self.browser.implicitly_wait(DELAY)
    
    def testElementsExists(self):
        self.browser.get(URL)
        self.assertTrue(self.browser.find_element_by_id('search-input'))
        self.assertTrue(self.browser.find_element_by_id('search-button'))
        self.assertTrue(self.browser.find_element_by_id('spinner'))
        self.assertTrue(self.browser.find_element_by_id('switch-draw'))
        self.assertTrue(self.browser.find_element_by_id('switch-draw'))
        self.assertTrue(self.browser.find_element_by_id('panel'))
        self.assertTrue(self.browser.find_element_by_id('button-about'))
        self.assertTrue(self.browser.find_element_by_id('dialog'))

    def testMapId(self):
        self.browser.get(URL)
        map_id = self.browser.find_element_by_id('input-save-map')
        self.assertNotEquals('', map_id.get_attribute("value"))
    
    def testChangeMap0(self):
        self.browser.get(URL)
        i = 0
        try:
            change_menu = WebDriverWait(self.browser, DELAY).until(EC.element_to_be_clickable((By.ID, 'menu-change-map')))
            change_menu.click()
            mapid = str(i)
            search = "//li[@map_id='" + mapid + "']"
            map = WebDriverWait(self.browser, DELAY).until(EC.element_to_be_clickable((By.XPATH, search)))
            map.click()
            map_id = self.browser.find_element_by_id('input-save-map')
            self.assertEquals(mapid, map_id.get_attribute("value"))
        except Exception as e:
            print(e)

    def testChangeMap1(self):
        self.browser.get(URL)
        i = 1
        try:
            change_menu = WebDriverWait(self.browser, DELAY).until(EC.element_to_be_clickable((By.ID, 'menu-change-map')))
            change_menu.click()
            mapid = str(i)
            search = "//li[@map_id='" + mapid + "']"
            map = WebDriverWait(self.browser, DELAY).until(EC.element_to_be_clickable((By.XPATH, search)))
            map.click()
            map_id = self.browser.find_element_by_id('input-save-map')
            self.assertEquals(mapid, map_id.get_attribute("value"))
        except Exception as e:
            print(e)
    
    def testChangeMap6(self):
        self.browser.get(URL)
        i = 6
        try:
            change_menu = WebDriverWait(self.browser, DELAY).until(EC.element_to_be_clickable((By.ID, 'menu-change-map')))
            change_menu.click()
            mapid = str(i)
            search = "//li[@map_id='" + mapid + "']"
            map = WebDriverWait(self.browser, DELAY).until(EC.element_to_be_clickable((By.XPATH, search)))
            map.click()
            map_id = self.browser.find_element_by_id('input-save-map')
            self.assertEquals(mapid, map_id.get_attribute("value"))
        except Exception as e:
            print(e)

    def testgetMap(self):
        for i in range(0,6):
            res = urlopen(URL + '/map/' + str(i))
            self.assertEqual(res.code, 200)
            text = res.read()
            self.assertTrue(str(i) in text)
            self.assertTrue("ESP" in text)
            self.assertTrue("ZWE" in text)

    def testgetCountryNotExists(self):
        try:
            urlopen(URL + '/details/5/' + 'ESN')
        except Exception as e:
            self.assertIn('500', str(e))
    
    def testgetTimeSeriesNotExists(self):
        try:
            urlopen(URL + '/details/7/' + COUNTRY_ID)
        except Exception as e:
            self.assertIn('500', str(e))


if __name__ == '__main__':
    unittest.main(verbosity = 2)