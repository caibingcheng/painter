from setuptools import setup, find_packages

setup(
    name='painter',
    version='0.1',
    packages=find_packages(),
    include_package_data=True,
    install_requires=[
        'Flask',
        'Flask-Sockets',
    ],
    entry_points={
        'console_scripts': [
            'painter=painter.app:main',
        ],
    },
    package_data={
        'painter': ['static/*', 'templates/*'],
    },
)
