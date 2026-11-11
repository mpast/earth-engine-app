import unittest
from selenium import webdriver
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from urllib.request import urlopen
from urllib.error import HTTPError
from json import loads

URL = 'http://localhost:8080'
DELAY = 200
COUNTRY_ID = 'ESP'

class TestCase(unittest.TestCase):

    def setUp(self):
        chrome_options = webdriver.ChromeOptions()
        chrome_options.add_argument('--headless')
        chrome_options.add_argument('--no-sandbox') # required when running as root user. otherwise you would get no sandbox errors. 
        self.browser = webdriver.Chrome(options=chrome_options)
        self.browser.implicitly_wait(DELAY)
    
    def tearDown(self):
        self.browser.quit()

    def testElementsExists(self):
        self.browser.get(URL)
        self.assertTrue(self.browser.find_element(By.ID, 'search-input'))
        self.assertTrue(self.browser.find_element(By.ID, 'search-button'))
        self.assertTrue(self.browser.find_element(By.ID, 'spinner'))
        self.assertTrue(self.browser.find_element(By.ID, 'switch-draw'))
        self.assertTrue(self.browser.find_element(By.ID, 'switch-draw'))
        self.assertTrue(self.browser.find_element(By.ID, 'panel'))
        self.assertTrue(self.browser.find_element(By.ID, 'button-about'))
        self.assertTrue(self.browser.find_element(By.ID, 'dialog'))

    def testMapId(self):
        self.browser.get(URL)
        map_id = self.browser.find_element(By.ID, 'input-save-map')
        self.assertNotEqual('', map_id.get_attribute("value"))
    
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
            map_id = self.browser.find_element(By.ID, 'input-save-map')
            self.assertEqual(mapid, map_id.get_attribute("value"))
        except Exception as e:
            raise

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
            map_id = self.browser.find_element(By.ID, 'input-save-map')
            self.assertEqual(mapid, map_id.get_attribute("value"))
        except Exception as e:
            raise
    
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
            map_id = self.browser.find_element(By.ID, 'input-save-map')
            self.assertEqual(mapid, map_id.get_attribute("value"))
        except Exception as e:
            raise

    def testgetMap(self):
        for i in range(0,7):
            res = urlopen(URL + '/map/' + str(i))
            self.assertEqual(res.code, 200)
            text = res.read().decode("utf-8")
            self.assertTrue(str(i) in text)
            self.assertTrue("ESP" in text)
            self.assertTrue("ZWE" in text)

    def testgetCountryNotExists(self):
        with self.assertRaises(HTTPError) as result:
            urlopen(URL + '/details/5/ESN')
        self.assertEqual(result.exception.code, 500)

    def testgetTimeSeriesNotExists(self):
        with self.assertRaises(HTTPError) as result:
            urlopen(URL + '/details/7/' + COUNTRY_ID)
        self.assertEqual(result.exception.code, 500)


if __name__ == '__main__':
    unittest.main(verbosity = 2)